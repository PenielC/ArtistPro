import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiContextService } from './ai-context.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER, type AiProvider } from './ai.types';
import { AnthropicProvider } from './anthropic.provider';
import { DemoProvider } from './demo.provider';

/**
 * Picks the AI backend: Claude when ANTHROPIC_API_KEY is set; otherwise the
 * demo provider if AI_DEMO_MODE=true (local development only, refused in
 * production); otherwise none, and AI endpoints answer 503.
 */
export function createAiProvider(config: ConfigService): AiProvider | null {
  const logger = new Logger('AiModule');
  const apiKey = config.get<string>('ANTHROPIC_API_KEY');
  const model = config.get<string>('AI_MODEL') || 'claude-opus-5';
  if (apiKey) {
    return new AnthropicProvider(new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60_000 }), model);
  }
  if (config.get<string>('AI_DEMO_MODE') === 'true') {
    if (config.get<string>('NODE_ENV') === 'production') {
      logger.error('AI_DEMO_MODE is ignored in production. Set ANTHROPIC_API_KEY to enable AI.');
      return null;
    }
    logger.warn('AI running in DEMO mode (no ANTHROPIC_API_KEY): responses are canned.');
    return new DemoProvider();
  }
  logger.warn('AI disabled: ANTHROPIC_API_KEY is not set.');
  return null;
}

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AiContextService,
    { provide: AI_PROVIDER, inject: [ConfigService], useFactory: createAiProvider },
  ],
})
export class AiModule {}
