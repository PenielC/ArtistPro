import { Injectable } from '@nestjs/common';

export interface ExchangeRate {
  from: string;
  to: string;
  /** Units of `to` per 1 unit of `from`. */
  rate: number;
  /** Date the rate was published (YYYY-MM-DD). */
  date: string;
  source: 'same-currency' | 'frankfurter' | 'exchangerate-api';
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Looks up a foreign-exchange rate. Frankfurter (ECB reference rates) is tried
 * first because it is the most authoritative source, but it only covers ~30
 * currencies and almost no African ones. open.er-api.com (keyless, ~160
 * currencies incl. ZWG/KES/NGN/GHS/BWP/ZMW) is the fallback. When neither has
 * the pair this returns null — a rate is never guessed, the caller must ask the
 * user to enter one.
 */
@Injectable()
export class ExchangeRateService {
  private readonly cache = new Map<string, { value: ExchangeRate; expiresAt: number }>();

  async getRate(fromInput: string, toInput: string): Promise<ExchangeRate | null> {
    const from = fromInput.toUpperCase();
    const to = toInput.toUpperCase();

    if (from === to) {
      return { from, to, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'same-currency' };
    }

    const key = `${from}>${to}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    for (const provider of [this.fromFrankfurter, this.fromExchangeRateApi]) {
      try {
        const result = await provider.call(this, from, to);
        if (result) {
          this.cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
          return result;
        }
      } catch {
        // Network error / timeout / bad payload — fall through to the next provider.
      }
    }
    return null;
  }

  private async fromFrankfurter(from: string, to: string): Promise<ExchangeRate | null> {
    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) return null; // 404 = currency not covered by the ECB set
    const body = (await response.json()) as { date?: string; rates?: Record<string, number> };
    const rate = body.rates?.[to];
    if (typeof rate !== 'number' || !(rate > 0) || !body.date) return null;
    return { from, to, rate, date: body.date, source: 'frankfurter' };
  }

  private async fromExchangeRateApi(from: string, to: string): Promise<ExchangeRate | null> {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: string;
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    const rate = body.rates?.[to];
    if (body.result !== 'success' || typeof rate !== 'number' || !(rate > 0)) return null;
    const published = body.time_last_update_utc ? new Date(body.time_last_update_utc) : new Date();
    return { from, to, rate, date: published.toISOString().slice(0, 10), source: 'exchangerate-api' };
  }
}
