import { ExchangeRateService } from './exchange-rate.service';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new ExchangeRateService();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 1 for the same currency without calling any provider', async () => {
    const result = await service.getRate('usd', 'USD');

    expect(result?.rate).toBe(1);
    expect(result?.source).toBe('same-currency');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses Frankfurter when it covers the pair', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ date: '2026-09-25', rates: { USD: 1.1403 } }));

    const result = await service.getRate('EUR', 'USD');

    expect(result).toEqual({ from: 'EUR', to: 'USD', rate: 1.1403, date: '2026-09-25', source: 'frankfurter' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('frankfurter');
  });

  it('falls back to the broader provider when Frankfurter does not cover the currency', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ message: 'not found' }, false, 404))
      .mockResolvedValueOnce(
        jsonResponse({ result: 'success', time_last_update_utc: 'Mon, 28 Sep 2026 00:02:31 +0000', rates: { USD: 0.0376 } }),
      );

    const result = await service.getRate('ZWG', 'USD');

    expect(result?.source).toBe('exchangerate-api');
    expect(result?.rate).toBe(0.0376);
    expect(result?.date).toBe('2026-09-28');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back when Frankfurter errors or times out', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ result: 'success', rates: { USD: 0.0077 } }));

    const result = await service.getRate('KES', 'USD');

    expect(result?.source).toBe('exchangerate-api');
    expect(result?.rate).toBe(0.0077);
  });

  it('returns null — never a guess — when no provider has the pair', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse({ result: 'error', 'error-type': 'unsupported-code' }));

    expect(await service.getRate('XXX', 'USD')).toBeNull();
  });

  it('returns null when both providers are unreachable', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'));

    expect(await service.getRate('EUR', 'USD')).toBeNull();
  });

  it('rejects a non-positive or non-numeric rate from a provider', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ date: '2026-09-25', rates: { USD: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ result: 'success', rates: { USD: 'oops' } }));

    expect(await service.getRate('EUR', 'USD')).toBeNull();
  });

  it('caches a successful lookup so repeated requests do not hit the provider again', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ date: '2026-09-25', rates: { USD: 1.1403 } }));

    await service.getRate('EUR', 'USD');
    const second = await service.getRate('eur', 'usd');

    expect(second?.rate).toBe(1.1403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
