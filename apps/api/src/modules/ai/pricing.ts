import type { AiUsage } from './ai.types';

/** USD per 1M tokens, Anthropic first-party list prices. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

// 5-minute cache writes cost 1.25x input; cache reads 0.1x.
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export interface PricedAttempt extends AiUsage {
  model: string;
}

/**
 * Estimated USD cost across every attempt that ran (a declined request plus
 * its fallback are both billed). An unknown model is priced as the requested one.
 */
export function estimateCostUsd(attempts: PricedAttempt[], requestedModel: string): number {
  let total = 0;
  for (const a of attempts) {
    const price = PRICES[a.model] ?? PRICES[requestedModel] ?? PRICES['claude-opus-5'];
    total +=
      (a.inputTokens * price.input +
        a.cacheWriteTokens * price.input * CACHE_WRITE +
        a.cacheReadTokens * price.input * CACHE_READ +
        a.outputTokens * price.output) /
      1_000_000;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}
