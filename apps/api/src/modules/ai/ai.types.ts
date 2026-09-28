export type AiEffort = 'low' | 'medium' | 'high';

export interface AiStreamRequest {
  system: string;
  prompt: string;
  effort: AiEffort;
  maxTokens: number;
  /** Used only by the demo provider: a deterministic stand-in answer built from the same data. */
  demoText: string;
  signal?: AbortSignal;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiStreamResult {
  text: string;
  /** Provider stop reason, e.g. end_turn, max_tokens, refusal. */
  stopReason: string | null;
  /** The model that produced the answer (a fallback model if the requested one declined). */
  model: string;
  usage: AiUsage;
  costUsd: number;
}

/** A language-model backend. Business logic depends on this, never on a vendor SDK. */
export interface AiProvider {
  readonly name: 'anthropic' | 'demo';
  readonly model: string;
  stream(request: AiStreamRequest, onText: (chunk: string) => void): Promise<AiStreamResult>;
}

/** The provider could not serve the request (overloaded, rate limited, unreachable, misconfigured). Safe to show. */
export class AiUnavailableError extends Error {}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
