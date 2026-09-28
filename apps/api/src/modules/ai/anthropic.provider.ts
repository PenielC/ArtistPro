import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, AiStreamRequest, AiStreamResult, AiUnavailableError } from './ai.types';
import { estimateCostUsd, type PricedAttempt } from './pricing';

/** Claude via the official SDK. Streams so long answers never hit HTTP timeouts. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;

  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async stream(request: AiStreamRequest, onText: (chunk: string) => void): Promise<AiStreamResult> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          // Adaptive thinking is on by default for Claude Opus 5; effort sets how much it thinks.
          output_config: { effort: request.effort },
          // If a safety classifier declines, Anthropic re-runs the request on its
          // recommended fallback model for that refusal category.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
        },
        { signal: request.signal },
      );
      stream.on('text', (text) => onText(text));
      message = await stream.finalMessage();
    } catch (err) {
      throw toAiError(err);
    }

    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return {
      text,
      stopReason: message.stop_reason,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      costUsd: estimateCostUsd(attemptsOf(message, this.model), this.model),
    };
  }
}

/** Per-attempt usage: `usage.iterations` lists each model that ran (including a declined one); top-level usage covers only the last. */
function attemptsOf(message: Anthropic.Beta.BetaMessage, requestedModel: string): PricedAttempt[] {
  const iterations = message.usage.iterations;
  if (iterations && iterations.length > 0) {
    return iterations.flatMap((it) =>
      'input_tokens' in it && 'output_tokens' in it
        ? [
            {
              model: ('model' in it && it.model) || requestedModel,
              inputTokens: it.input_tokens,
              outputTokens: it.output_tokens,
              cacheReadTokens: ('cache_read_input_tokens' in it && it.cache_read_input_tokens) || 0,
              cacheWriteTokens: ('cache_creation_input_tokens' in it && it.cache_creation_input_tokens) || 0,
            },
          ]
        : [],
    );
  }
  return [
    {
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
  ];
}

/** Maps SDK errors (most specific first) to messages safe to show a user. Cancellation passes through untouched. */
function toAiError(err: unknown): Error {
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiUnavailableError('The AI service is not configured correctly (API key rejected). Please contact support.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiUnavailableError('The AI service is busy right now. Please try again in a minute.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AiUnavailableError('The AI service could not process this request.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiUnavailableError('The AI service could not be reached. Please try again.');
  }
  if (err instanceof Anthropic.APIError) {
    return new AiUnavailableError('The AI service had a problem. Please try again shortly.');
  }
  return err instanceof Error ? err : new Error(String(err));
}
