import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { AiFeature, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PreparedGeneration } from './ai-context.service';
import { AI_PROVIDER, AiUnavailableError, type AiProvider } from './ai.types';

export type AiStreamEvent =
  | { type: 'start'; generationId: string; model: string; demo: boolean }
  | { type: 'text'; text: string }
  | { type: 'done'; generationId: string; truncated: boolean; usage: { used: number; limit: number } }
  | { type: 'error'; message: string };

/** Generations that count toward the cap: everything except attempts that failed without producing output. */
export const COUNTED_GENERATION = {
  OR: [{ status: { not: 'FAILED' } }, { outputTokens: { gt: 0 } }],
} satisfies Prisma.AiGenerationWhereInput;

/** First day of the current calendar month, UTC: the cap resets then. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
  ) {}

  private countThisMonth(organizationId: string, now: Date) {
    return this.prisma.aiGeneration.count({
      where: { organizationId, createdAt: { gte: monthStart(now) }, ...COUNTED_GENERATION },
    });
  }

  async status(organizationId: string, now = new Date()) {
    const [used, org] = await Promise.all([
      this.countThisMonth(organizationId, now),
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { aiMonthlyLimit: true } }),
    ]);
    const next = monthStart(now);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return {
      available: !!this.provider,
      provider: this.provider?.name ?? null,
      model: this.provider?.model ?? null,
      used,
      limit: org.aiMonthlyLimit,
      resetsAt: next.toISOString(),
    };
  }

  /** Throws a normal HTTP error (before any streaming starts) if AI can't be used right now. */
  async assertCanGenerate(organizationId: string, now = new Date()) {
    if (!this.provider) throw new ServiceUnavailableException('AI features are not configured on this server yet.');
    const { used, limit } = await this.status(organizationId, now);
    if (used >= limit) {
      throw new HttpException(
        `You've used all ${limit} AI generations for this month. The allowance resets on the 1st.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async history(organizationId: string, feature?: AiFeature) {
    const rows = await this.prisma.aiGeneration.findMany({
      where: { organizationId, ...(feature && { feature }) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, feature: true, variant: true, subjectType: true, subjectId: true, instructions: true, status: true, output: true, error: true,
        model: true, costUsd: true, createdAt: true, user: { select: { firstName: true } },
      },
    });
    return rows.map((r) => ({ ...r, costUsd: Number(r.costUsd) }));
  }

  /**
   * Runs a prepared generation, streaming text through `emit`, and records
   * the outcome. Never throws: every failure is recorded and reported as an
   * `error` event, because the HTTP response has already started.
   */
  async run(organizationId: string, userId: string, prepared: PreparedGeneration, emit: (e: AiStreamEvent) => void, signal?: AbortSignal) {
    const provider = this.provider!;
    const row = await this.prisma.aiGeneration.create({
      data: {
        organizationId,
        userId,
        feature: prepared.feature,
        variant: prepared.variant,
        subjectType: prepared.subjectType,
        subjectId: prepared.subjectId,
        instructions: prepared.instructions,
        model: provider.model,
      },
    });
    emit({ type: 'start', generationId: row.id, model: provider.model, demo: provider.name === 'demo' });

    try {
      const result = await provider.stream(
        { system: prepared.system, prompt: prepared.prompt, effort: prepared.effort, maxTokens: prepared.maxTokens, demoText: prepared.demoText, signal },
        (text) => emit({ type: 'text', text }),
      );
      const refused = result.stopReason === 'refusal';
      await this.prisma.aiGeneration.update({
        where: { id: row.id },
        data: {
          status: refused ? 'REFUSED' : 'COMPLETED',
          output: result.text,
          model: result.model,
          stopReason: result.stopReason,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheWriteTokens: result.usage.cacheWriteTokens,
          costUsd: result.costUsd,
          completedAt: new Date(),
        },
      });
      if (refused) {
        emit({ type: 'error', message: "The AI declined this request. Try rephrasing it, or write this one yourself." });
        return;
      }
      const { used, limit } = await this.status(organizationId);
      emit({ type: 'done', generationId: row.id, truncated: result.stopReason === 'max_tokens', usage: { used, limit } });
    } catch (err) {
      const cancelled = signal?.aborted ?? false;
      const message = err instanceof AiUnavailableError ? err.message : cancelled ? 'Cancelled.' : 'Something went wrong while generating. Please try again.';
      if (!(err instanceof AiUnavailableError) && !cancelled) this.logger.error(`AI generation ${row.id} failed`, err as Error);
      await this.prisma.aiGeneration.update({ where: { id: row.id }, data: { status: 'FAILED', error: cancelled ? 'cancelled' : (err as Error).message?.slice(0, 500), completedAt: new Date() } });
      emit({ type: 'error', message });
    }
  }
}
