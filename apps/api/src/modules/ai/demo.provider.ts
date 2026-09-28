import { AiProvider, AiStreamRequest, AiStreamResult } from './ai.types';

export const DEMO_PREFIX = '[Demo AI: no API key configured] ';

/**
 * Local-development stand-in: streams a deterministic answer built from the
 * same business data, so every screen can be used and tested without an API
 * key. Never enabled in production (see ai.module.ts).
 */
export class DemoProvider implements AiProvider {
  readonly name = 'demo' as const;
  readonly model = 'demo';

  constructor(private readonly delayMs = 15) {}

  async stream(request: AiStreamRequest, onText: (chunk: string) => void): Promise<AiStreamResult> {
    const text = DEMO_PREFIX + request.demoText;
    for (const chunk of text.match(/\S+\s*/g) ?? []) {
      if (request.signal?.aborted) {
        const err = new Error('Request was aborted.');
        err.name = 'AbortError';
        throw err;
      }
      onText(chunk);
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    }
    return {
      text,
      stopReason: 'end_turn',
      model: 'demo',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0,
    };
  }
}
