export const CONTRACT_PLACEHOLDERS = [
  { key: 'today', description: 'The date the contract is created' },
  { key: 'artistName', description: 'The artist / business name' },
  { key: 'clientName', description: 'The client or organiser' },
  { key: 'title', description: 'The contract title' },
  { key: 'eventType', description: 'e.g. Wedding, Corporate gala' },
  { key: 'eventDate', description: 'The event date' },
  { key: 'venue', description: 'The event venue' },
  { key: 'duration', description: 'Performance duration' },
  { key: 'fee', description: 'The total performance fee' },
  { key: 'deposit', description: 'The deposit payable on signing' },
  { key: 'balance', description: 'The fee minus the deposit' },
  { key: 'paymentTerms', description: 'When the balance is due' },
  { key: 'cancellationTerms', description: 'The cancellation terms' },
  { key: 'accommodation', description: 'Accommodation arrangements' },
  { key: 'transport', description: 'Transport arrangements' },
  { key: 'extraTerms', description: 'Any additional terms' },
] as const;

const KNOWN_KEYS = new Set<string>(CONTRACT_PLACEHOLDERS.map((p) => p.key));
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export const DEFAULT_CONTRACT_TEMPLATE = {
  name: 'Standard performance agreement',
  body: `PERFORMANCE AGREEMENT

This agreement is made on {{today}} between {{artistName}} ("the Artist") and {{clientName}} ("the Client").

1. THE EVENT
The Artist agrees to perform at the following event:
Event: {{title}}
Type of event: {{eventType}}
Date: {{eventDate}}
Venue: {{venue}}
Performance duration: {{duration}}

2. FEE AND PAYMENT
The Client agrees to pay the Artist a total performance fee of {{fee}}.
A deposit of {{deposit}} is payable on signing this agreement. The balance of {{balance}} is payable {{paymentTerms}}.
The date is not reserved for the Client until the deposit has been received.

3. CANCELLATION
{{cancellationTerms}}

4. ACCOMMODATION AND TRAVEL
Accommodation: {{accommodation}}
Transport: {{transport}}

5. ADDITIONAL TERMS
{{extraTerms}}

6. GENERAL
This agreement is the entire agreement between the parties for this event. Any change must be in writing and agreed by both parties. The parties will try to resolve any disagreement by discussing it in good faith first.`,
};

export interface ContractValues {
  artistName: string;
  clientName: string;
  title: string;
  eventType?: string | null;
  eventDate?: Date | null;
  venue?: string | null;
  durationMinutes?: number | null;
  currency: string;
  fee: number;
  depositAmount: number;
  paymentTerms?: string | null;
  cancellationTerms?: string | null;
  accommodation?: string | null;
  transport?: string | null;
  extraTerms?: string | null;
  today: Date;
}

const NOT_SPECIFIED = 'Not specified';

function formatDate(date: Date): string {
  // Dates are stored as UTC midnight; format in UTC so the day never shifts with the server's timezone.
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : '';
  const minutePart = rest > 0 ? `${rest} minute${rest === 1 ? '' : 's'}` : '';
  return [hourPart, minutePart].filter(Boolean).join(' ');
}

const text = (value?: string | null, fallback = NOT_SPECIFIED) => (value && value.trim() ? value.trim() : fallback);

/** Placeholder keys used in `body` that we don't know how to fill. */
export function findUnknownPlaceholders(body: string): string[] {
  const unknown = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER)) {
    if (!KNOWN_KEYS.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

/** Fills `{{placeholders}}` in a template. Anything unset renders as "Not specified", never as blank. */
export function renderContract(body: string, values: ContractValues): string {
  const rendered: Record<string, string> = {
    today: formatDate(values.today),
    artistName: values.artistName,
    clientName: values.clientName,
    title: values.title,
    eventType: text(values.eventType),
    eventDate: values.eventDate ? formatDate(values.eventDate) : NOT_SPECIFIED,
    venue: text(values.venue),
    duration: values.durationMinutes ? formatDuration(values.durationMinutes) : NOT_SPECIFIED,
    fee: formatMoney(values.fee, values.currency),
    deposit: formatMoney(values.depositAmount, values.currency),
    balance: formatMoney(Math.round((values.fee - values.depositAmount) * 100) / 100, values.currency),
    paymentTerms: text(values.paymentTerms),
    cancellationTerms: text(values.cancellationTerms),
    accommodation: text(values.accommodation),
    transport: text(values.transport),
    extraTerms: text(values.extraTerms, 'None.'),
  };

  // A replacer function (not a replacement string) so "$&" etc. in user text is inserted literally.
  return body.replace(PLACEHOLDER, (whole, key: string) => rendered[key] ?? whole);
}
