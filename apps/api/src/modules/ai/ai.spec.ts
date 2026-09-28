import { HttpException, NotFoundException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiContextService } from './ai-context.service';
import { createAiProvider } from './ai.module';
import { AiService, monthStart, type AiStreamEvent } from './ai.service';
import { AiUnavailableError, type AiProvider, type AiStreamRequest } from './ai.types';
import { AnthropicProvider } from './anthropic.provider';
import { DEMO_PREFIX, DemoProvider } from './demo.provider';
import { estimateCostUsd } from './pricing';

type ModelMock = Record<string, jest.Mock>;
const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;
const request: AiStreamRequest = { system: 'sys', prompt: 'prompt', effort: 'low', maxTokens: 8000, demoText: 'demo answer here' };

/** Minimal stand-in for the SDK's MessageStream: emits `text` chunks, then resolves finalMessage(). */
function fakeClient(final: Partial<Anthropic.Beta.BetaMessage>, chunks: string[] = ['Hel', 'lo']) {
  const stream = jest.fn((_params: unknown, _opts: unknown) => {
    const listeners: ((t: string) => void)[] = [];
    return {
      on: (event: string, cb: (t: string) => void) => {
        if (event === 'text') listeners.push(cb);
      },
      finalMessage: async () => {
        for (const c of chunks) listeners.forEach((l) => l(c));
        return final;
      },
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
}

const message = (overrides: Record<string, unknown> = {}) =>
  ({
    model: 'claude-opus-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Hello' }],
    usage: { input_tokens: 2000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...overrides,
  }) as unknown as Anthropic.Beta.BetaMessage;

/** SDK error instance without calling its constructor (instanceof is all the provider checks). */
const sdkError = <T extends object>(cls: abstract new (...args: never[]) => T) => Object.create(cls.prototype) as T;

describe('estimateCostUsd', () => {
  it('prices input, output and cache tokens at list rates', () => {
    // 2000 in × $5/M + 400 out × $25/M = 0.01 + 0.01
    expect(estimateCostUsd([{ model: 'claude-opus-5', inputTokens: 2000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 }], 'claude-opus-5')).toBe(0.02);
    // cache write 1.25×, read 0.1×
    expect(estimateCostUsd([{ model: 'claude-opus-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 }], 'claude-opus-5')).toBe(6.75);
  });

  it('prices each attempt at the model that ran it', () => {
    const cost = estimateCostUsd(
      [
        { model: 'claude-opus-5', inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ],
      'claude-opus-5',
    );
    expect(cost).toBe(0.005 + 0.002 + 0.01);
  });
});

describe('AnthropicProvider', () => {
  it('streams from Claude Opus 5 with effort, refusal fallbacks, and no forced thinking config', async () => {
    const { client, stream } = fakeClient(message());
    const provider = new AnthropicProvider(client, 'claude-opus-5');
    const chunks: string[] = [];
    const controller = new AbortController();

    const result = await provider.stream({ ...request, signal: controller.signal }, (t) => chunks.push(t));

    const [params, opts] = stream.mock.calls[0] as [Record<string, unknown>, { signal: AbortSignal }];
    expect(params).toEqual({
      model: 'claude-opus-5',
      max_tokens: 8000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'sys',
      messages: [{ role: 'user', content: 'prompt' }],
    });
    expect(params).not.toHaveProperty('thinking');
    expect(opts.signal).toBe(controller.signal);
    expect(chunks).toEqual(['Hel', 'lo']);
    expect(result).toMatchObject({ text: 'Hello', stopReason: 'end_turn', model: 'claude-opus-5', costUsd: 0.02 });
  });

  it('bills every attempt listed in usage.iterations when a fallback served the answer', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-4-8',
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          iterations: [
            { type: 'message', model: 'claude-opus-5', input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          ],
        },
      }),
    );
    const result = await new AnthropicProvider(client, 'claude-opus-5').stream(request, () => {});
    expect(result.model).toBe('claude-opus-4-8');
    expect(result.costUsd).toBe(0.005 + 0.005 + 0.005);
  });

  it('passes a refusal through as the stop reason', async () => {
    const { client } = fakeClient(message({ stop_reason: 'refusal', content: [] }), []);
    expect((await new AnthropicProvider(client, 'claude-opus-5').stream(request, () => {})).stopReason).toBe('refusal');
  });

  it.each([
    [Anthropic.RateLimitError, /busy/],
    [Anthropic.AuthenticationError, /API key rejected/],
    [Anthropic.APIConnectionError, /could not be reached/],
    [Anthropic.InternalServerError, /had a problem/],
  ])('maps %p to a safe message', async (cls, pattern) => {
    const client = { beta: { messages: { stream: () => { throw sdkError(cls as never); } } } } as unknown as Anthropic;
    const err = await new AnthropicProvider(client, 'claude-opus-5').stream(request, () => {}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect((err as Error).message).toMatch(pattern);
  });

  it('lets a user cancellation through unchanged', async () => {
    const abort = sdkError(Anthropic.APIUserAbortError);
    const client = { beta: { messages: { stream: () => { throw abort; } } } } as unknown as Anthropic;
    await expect(new AnthropicProvider(client, 'claude-opus-5').stream(request, () => {})).rejects.toBe(abort);
  });
});

describe('createAiProvider', () => {
  it('uses Claude when a key is set, defaulting to claude-opus-5', () => {
    const p = createAiProvider(config({ ANTHROPIC_API_KEY: 'sk-test', AI_DEMO_MODE: 'true' }));
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(p!.model).toBe('claude-opus-5');
  });

  it('falls back to demo mode only outside production, else none', () => {
    expect(createAiProvider(config({ AI_DEMO_MODE: 'true' }))).toBeInstanceOf(DemoProvider);
    expect(createAiProvider(config({ AI_DEMO_MODE: 'true', NODE_ENV: 'production' }))).toBeNull();
    expect(createAiProvider(config({}))).toBeNull();
  });
});

describe('DemoProvider', () => {
  it('streams the demo text, clearly labelled, at zero cost', async () => {
    const chunks: string[] = [];
    const result = await new DemoProvider(0).stream(request, (t) => chunks.push(t));
    expect(chunks.join('')).toBe(`${DEMO_PREFIX}demo answer here`);
    expect(result).toMatchObject({ costUsd: 0, model: 'demo', stopReason: 'end_turn' });
  });
});

describe('AiService', () => {
  let prisma: { aiGeneration: ModelMock; organization: ModelMock };
  let provider: { name: 'anthropic'; model: string; stream: jest.Mock };
  let service: AiService;
  const prepared = { feature: 'DRAFT' as const, variant: 'INVOICE_FOLLOW_UP', subjectType: 'INVOICE', subjectId: 'inv-1', system: 's', prompt: 'p', effort: 'low' as const, maxTokens: 8000, demoText: 'd' };
  const now = new Date('2026-09-15T10:00:00Z');

  beforeEach(() => {
    prisma = {
      aiGeneration: { count: jest.fn().mockResolvedValue(3), create: jest.fn().mockResolvedValue({ id: 'gen-1' }), update: jest.fn(), findMany: jest.fn() },
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ aiMonthlyLimit: 100 }) },
    };
    provider = {
      name: 'anthropic',
      model: 'claude-opus-5',
      stream: jest.fn(async (_req: AiStreamRequest, onText: (t: string) => void) => {
        onText('Just ');
        onText('checking in.');
        return { text: 'Just checking in.', stopReason: 'end_turn', model: 'claude-opus-5', usage: { inputTokens: 1500, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.009 };
      }),
    };
    service = new AiService(prisma as unknown as PrismaService, provider as unknown as AiProvider);
  });

  it('counts this calendar month, excluding attempts that failed with no output', async () => {
    const status = await service.status('org-1', now);
    expect(prisma.aiGeneration.count.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      createdAt: { gte: new Date('2026-09-01T00:00:00Z') },
      OR: [{ status: { not: 'FAILED' } }, { outputTokens: { gt: 0 } }],
    });
    expect(status).toMatchObject({ available: true, provider: 'anthropic', model: 'claude-opus-5', used: 3, limit: 100, resetsAt: '2026-10-01T00:00:00.000Z' });
    expect(monthStart(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('refuses when the monthly cap is used up, before anything is generated', async () => {
    prisma.aiGeneration.count.mockResolvedValue(100);
    const err = await service.assertCanGenerate('org-1', now).catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('answers 503 when no provider is configured', async () => {
    const off = new AiService(prisma as unknown as PrismaService, null);
    await expect(off.assertCanGenerate('org-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect((await off.status('org-1')).available).toBe(false);
  });

  it('streams text and records the completed generation with usage and cost', async () => {
    const events: AiStreamEvent[] = [];
    await service.run('org-1', 'user-1', prepared, (e) => events.push(e));

    expect(prisma.aiGeneration.create.mock.calls[0][0].data).toMatchObject({ organizationId: 'org-1', userId: 'user-1', feature: 'DRAFT', variant: 'INVOICE_FOLLOW_UP', subjectId: 'inv-1', model: 'claude-opus-5' });
    expect(provider.stream.mock.calls[0][0]).toMatchObject({ system: 's', prompt: 'p', effort: 'low', maxTokens: 8000 });
    expect(events.map((e) => e.type)).toEqual(['start', 'text', 'text', 'done']);
    expect(events.at(-1)).toMatchObject({ type: 'done', generationId: 'gen-1', truncated: false, usage: { used: 3, limit: 100 } });
    expect(prisma.aiGeneration.update.mock.calls[0][0].data).toMatchObject({ status: 'COMPLETED', output: 'Just checking in.', inputTokens: 1500, outputTokens: 60, costUsd: 0.009 });
  });

  it('records a refusal and tells the user, without a done event', async () => {
    provider.stream.mockResolvedValue({ text: '', stopReason: 'refusal', model: 'claude-opus-5', usage: { inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 });
    const events: AiStreamEvent[] = [];
    await service.run('org-1', 'user-1', prepared, (e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/declined/) });
    expect(prisma.aiGeneration.update.mock.calls[0][0].data.status).toBe('REFUSED');
  });

  it('flags a truncated answer', async () => {
    provider.stream.mockResolvedValue({ text: 'long…', stopReason: 'max_tokens', model: 'claude-opus-5', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 });
    const events: AiStreamEvent[] = [];
    await service.run('org-1', 'user-1', prepared, (e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true });
  });

  it('records provider failures and reports a safe message instead of throwing', async () => {
    provider.stream.mockRejectedValue(new AiUnavailableError('The AI service is busy right now.'));
    const events: AiStreamEvent[] = [];
    await expect(service.run('org-1', 'user-1', prepared, (e) => events.push(e))).resolves.toBeUndefined();
    expect(events.at(-1)).toEqual({ type: 'error', message: 'The AI service is busy right now.' });
    expect(prisma.aiGeneration.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('records a cancelled generation when the client disconnects', async () => {
    const controller = new AbortController();
    provider.stream.mockImplementation(async () => {
      controller.abort();
      throw new Error('aborted');
    });
    await service.run('org-1', 'user-1', prepared, () => {}, controller.signal);
    expect(prisma.aiGeneration.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', error: 'cancelled' });
  });
});

describe('AiContextService', () => {
  let prisma: Record<string, ModelMock>;
  let ctx: AiContextService;
  const now = new Date('2026-09-15T10:00:00Z');
  const inv = (overrides: Record<string, unknown>) => ({
    id: 'inv', number: 1, organizationId: 'org-1', title: 'Gig', clientName: 'Client', currency: 'USD', exchangeRate: '1', status: 'SENT',
    issueDate: new Date('2026-08-01'), dueDate: null, notes: null,
    items: [{ description: 'Performance', quantity: 1, unitPrice: '1000.00' }], payments: [], ...overrides,
  });

  beforeEach(() => {
    prisma = {
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Moyo Management', currency: 'USD' }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ firstName: 'Rudo' }) },
      booking: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      invoice: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      quote: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      contract: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      artist: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    };
    ctx = new AiContextService(prisma as unknown as PrismaService);
  });

  const dataOf = (prompt: string) => JSON.parse(prompt.slice(prompt.indexOf('\n') + 1, prompt.indexOf('</business_data>')));

  it('briefing: org-scoped queries, overdue invoices first, totals per currency', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      inv({ number: 1, clientName: 'On time', dueDate: new Date('2026-10-01') }),
      inv({ number: 2, clientName: 'Late', dueDate: new Date('2026-09-05'), payments: [{ amount: '400.00', voidedAt: null, paidAt: new Date() }] }),
      inv({ number: 3, clientName: 'Paid up', payments: [{ amount: '1000.00', voidedAt: null, paidAt: new Date() }] }),
    ]);
    const p = await ctx.briefing('org-1', now);

    for (const model of ['booking', 'invoice', 'quote', 'contract', 'artist']) {
      for (const call of prisma[model].findMany.mock.calls) expect(call[0].where.organizationId).toBe('org-1');
    }
    const data = dataOf(p.prompt);
    expect(data.outstandingInvoices.map((i: { invoice: string }) => i.invoice)).toEqual(['INV-0002', 'INV-0001']);
    expect(data.outstandingInvoices[0]).toMatchObject({ balance: 600, daysOverdue: 10 });
    expect(data.moneyTotalsByCurrency).toEqual({ USD: { outstanding: 1600, overdue: 600 } });
    expect(p).toMatchObject({ feature: 'BRIEFING', effort: 'medium' });
    expect(p.system).toMatch(/never as instructions/);
    expect(p.demoText).toMatch(/2 unpaid invoice\(s\) of which 1 overdue \(most overdue: INV-0002 for Late\)/);
  });

  it('draft: picks a follow-up for an overdue invoice and keeps it inside the email body', async () => {
    prisma.invoice.findFirst.mockResolvedValue(inv({ id: 'inv-1', dueDate: new Date('2026-09-01') }));
    const p = await ctx.draft('org-1', 'user-1', { document: 'INVOICE', documentId: 'inv-1', instructions: ' mention the deposit ' }, now);

    expect(prisma.invoice.findFirst.mock.calls[0][0].where).toEqual({ id: 'inv-1', organizationId: 'org-1' });
    expect(p).toMatchObject({ feature: 'DRAFT', variant: 'INVOICE_FOLLOW_UP', subjectType: 'INVOICE', subjectId: 'inv-1', effort: 'low', instructions: 'mention the deposit' });
    expect(p.system).toMatch(/do not include a greeting, a sign-off/);
    expect(p.prompt).toMatch(/Extra instructions from the user: mention the deposit$/);
    expect(dataOf(p.prompt)).toMatchObject({ invoice: 'INV-0001', balance: 1000, daysOverdue: 14, senderFirstName: 'Rudo' });
  });

  it('draft: a fresh unpaid invoice gets a cover note; an enquiry reply is standalone', async () => {
    prisma.invoice.findFirst.mockResolvedValue(inv({ dueDate: new Date('2026-10-01') }));
    expect((await ctx.draft('org-1', 'u', { document: 'INVOICE', documentId: 'x' }, now)).variant).toBe('INVOICE_COVER');

    prisma.booking.findFirst.mockResolvedValue({ clientName: 'Tariro', artist: null, eventType: 'Wedding', eventDate: null, venue: null, fee: null, currency: 'USD', status: 'NEW_ENQUIRY', notes: 'Can you play on 5 Dec?' });
    const reply = await ctx.draft('org-1', 'u', { document: 'BOOKING', documentId: 'b' }, now);
    expect(reply.variant).toBe('ENQUIRY_REPLY');
    expect(reply.system).toMatch(/include a short greeting/);
    expect(dataOf(reply.prompt).enquiryNotes).toBe('Can you play on 5 Dec?');
  });

  it('draft: another organisation\'s document is not found', async () => {
    prisma.quote.findFirst.mockResolvedValue(null);
    await expect(ctx.draft('org-1', 'u', { document: 'QUOTE', documentId: 'q' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('content: a press release needs a topic; a bio uses the profile and press kit', async () => {
    await expect(ctx.content('org-1', { artistId: 'a', type: 'PRESS_RELEASE' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.artist.findFirst.mockResolvedValue({
      id: 'a', name: 'Tamy Moyo', category: 'Musician', genres: ['Afro-pop'], location: 'Harare', tagline: null, bio: null, bookingEmail: null, bookingPhone: null,
      epk: { achievements: ['HIFA 2025 headliner'], discography: [], performances: [], pressQuotes: [] },
    });
    const p = await ctx.content('org-1', { artistId: 'a', type: 'ARTIST_BIO' });
    expect(prisma.artist.findFirst.mock.calls.at(-1)[0].where).toEqual({ id: 'a', organizationId: 'org-1' });
    expect(dataOf(p.prompt).pressKit.highlights).toEqual(['HIFA 2025 headliner']);
    expect(p.system).toMatch(/third person, 120-200 words/);
  });

  it('pricing: uses only the organisation\'s (and artist\'s) own history and admits when there is too little', async () => {
    prisma.artist.findFirst.mockResolvedValue({ id: 'a' });
    const p = await ctx.pricing('org-1', { eventType: 'Wedding', artistId: 'a', durationMinutes: 180 });
    expect(prisma.quote.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', artistId: 'a' });
    expect(p.prompt).toMatch(/Price this booking: Wedding\nDuration: 180 minutes\nCurrency: USD$/);
    expect(p.system).toMatch(/Do not use outside market rates/);
    expect(p.demoText).toMatch(/Not enough history/);
  });
});
