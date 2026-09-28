import {
  CONTRACT_PLACEHOLDERS,
  DEFAULT_CONTRACT_TEMPLATE,
  findUnknownPlaceholders,
  renderContract,
  type ContractValues,
} from './contract-renderer';

const values: ContractValues = {
  artistName: 'Kuda Live Band',
  clientName: 'Tariro Events',
  title: 'Wedding – Meikles Hotel',
  eventType: 'Wedding',
  eventDate: new Date('2026-12-05T00:00:00Z'),
  venue: 'Meikles Hotel, Harare',
  durationMinutes: 150,
  currency: 'USD',
  fee: 1200,
  depositAmount: 600,
  paymentTerms: 'in full seven days before the event',
  cancellationTerms: 'Deposit is non-refundable.',
  accommodation: 'Provided by the Client',
  transport: 'Provided by the Artist',
  extraTerms: null,
  today: new Date('2026-09-28T10:00:00Z'),
};

describe('renderContract', () => {
  it('fills every placeholder of the built-in template — none are left over', () => {
    const output = renderContract(DEFAULT_CONTRACT_TEMPLATE.body, values);

    expect(output).not.toMatch(/\{\{/);
    expect(output).toContain('made on 28 September 2026 between Kuda Live Band');
    expect(output).toContain('Date: 5 December 2026');
    expect(output).toContain('Venue: Meikles Hotel, Harare');
    expect(output).toContain('Performance duration: 2 hours 30 minutes');
    expect(output).toContain('total performance fee of $1,200.00');
    expect(output).toContain('A deposit of $600.00 is payable');
    expect(output).toContain('balance of $600.00 is payable in full seven days before the event');
    expect(output).toContain('Deposit is non-refundable.');
  });

  it('only uses placeholders the renderer knows about (the built-in template stays valid)', () => {
    expect(findUnknownPlaceholders(DEFAULT_CONTRACT_TEMPLATE.body)).toEqual([]);
  });

  it('renders anything unset as "Not specified" rather than a blank, and extra terms as "None."', () => {
    const output = renderContract('{{venue}} | {{eventDate}} | {{duration}} | {{accommodation}} | {{extraTerms}}', {
      ...values,
      venue: '   ',
      eventDate: null,
      durationMinutes: null,
      accommodation: undefined,
      extraTerms: undefined,
    });

    expect(output).toBe('Not specified | Not specified | Not specified | Not specified | None.');
  });

  it('formats the date in UTC so it never shifts a day with the server timezone', () => {
    const output = renderContract('{{eventDate}}', { ...values, eventDate: new Date('2026-01-01T00:00:00Z') });
    expect(output).toBe('1 January 2026');
  });

  it('computes the balance as fee minus deposit, rounded to cents', () => {
    const output = renderContract('{{balance}}', { ...values, fee: 100.1, depositAmount: 33.3 });
    expect(output).toBe('$66.80');
  });

  it('formats a foreign currency with its own code, not a dollar sign', () => {
    const output = renderContract('{{fee}}', { ...values, currency: 'EUR', fee: 1000 });
    expect(output).toBe('€1,000.00');
  });

  it('falls back to "CODE amount" for a currency Intl does not recognise', () => {
    const output = renderContract('{{fee}}', { ...values, currency: 'ZZZZ', fee: 10 });
    expect(output).toBe('ZZZZ 10.00');
  });

  it('inserts user text literally — regex replacement patterns like $& are not interpreted', () => {
    const output = renderContract('{{extraTerms}}', { ...values, extraTerms: 'Pay $& then $1 and $$' });
    expect(output).toBe('Pay $& then $1 and $$');
  });

  it('tolerates spaces inside the braces', () => {
    expect(renderContract('{{ clientName }}', values)).toBe('Tariro Events');
  });

  it('uses singular hour/minute wording correctly', () => {
    expect(renderContract('{{duration}}', { ...values, durationMinutes: 60 })).toBe('1 hour');
    expect(renderContract('{{duration}}', { ...values, durationMinutes: 61 })).toBe('1 hour 1 minute');
    expect(renderContract('{{duration}}', { ...values, durationMinutes: 45 })).toBe('45 minutes');
  });
});

describe('findUnknownPlaceholders', () => {
  it('reports typos and de-duplicates them', () => {
    expect(findUnknownPlaceholders('Fee {{fe}} and {{fe}} and {{clientNme}} but {{fee}} is fine')).toEqual([
      'fe',
      'clientNme',
    ]);
  });

  it('exposes every placeholder it can fill', () => {
    const keys = CONTRACT_PLACEHOLDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(findUnknownPlaceholders(`{{${key}}}`)).toEqual([]);
    }
  });
});
