import { Body, Controller, Get, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiFeature } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import type { Response } from 'express';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiContextService, type PreparedGeneration } from './ai-context.service';
import { AiService, type AiStreamEvent } from './ai.service';
import { ContentRequestDto, DraftRequestDto, PricingRequestDto } from './dto/ai.dto';

class HistoryQueryDto {
  @IsOptional()
  @IsEnum(AiFeature)
  feature?: AiFeature;
}

/**
 * Generation endpoints stream Server-Sent Events over a POST (so the bearer
 * token travels in a header): `start`, many `text` chunks, then `done` or `error`.
 * Validation, access and quota problems are ordinary HTTP errors, raised
 * before the stream opens.
 */
@ApiTags('ai')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: JwtPayload) {
    return this.ai.status(user.organizationId);
  }

  @Get('history')
  history(@CurrentUser() user: JwtPayload, @Query() q: HistoryQueryDto) {
    return this.ai.history(user.organizationId, q.feature);
  }

  @Post('briefing')
  @HttpCode(200)
  async briefing(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    await this.ai.assertCanGenerate(user.organizationId);
    await this.stream(user, await this.context.briefing(user.organizationId), res);
  }

  @Post('draft')
  @HttpCode(200)
  async draft(@CurrentUser() user: JwtPayload, @Body() dto: DraftRequestDto, @Res() res: Response) {
    await this.ai.assertCanGenerate(user.organizationId);
    await this.stream(user, await this.context.draft(user.organizationId, user.sub, dto), res);
  }

  @Post('content')
  @HttpCode(200)
  async content(@CurrentUser() user: JwtPayload, @Body() dto: ContentRequestDto, @Res() res: Response) {
    await this.ai.assertCanGenerate(user.organizationId);
    await this.stream(user, await this.context.content(user.organizationId, dto), res);
  }

  @Post('pricing')
  @HttpCode(200)
  async pricing(@CurrentUser() user: JwtPayload, @Body() dto: PricingRequestDto, @Res() res: Response) {
    await this.ai.assertCanGenerate(user.organizationId);
    await this.stream(user, await this.context.pricing(user.organizationId, dto), res);
  }

  private async stream(user: JwtPayload, prepared: PreparedGeneration, res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
    res.flushHeaders();

    // If the browser goes away, stop generating (and stop paying for tokens).
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const emit = (event: AiStreamEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    await this.ai.run(user.organizationId, user.sub, prepared, emit, abort.signal);
    res.end();
  }
}
