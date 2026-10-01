/**
 * Email content, as plain functions. Each builder returns the subject and a
 * plain-text body (what the log stores and shows), plus an optional call to
 * action. HTML is rendered from that at send time, so every email is readable
 * as text and the HTML never contains unescaped user input.
 */

export interface ComposedEmail {
  subject: string;
  bodyText: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

const invoiceNumber = (n: number) => `INV-${String(n).padStart(4, '0')}`;
const quoteNumber = (n: number) => `Q-${String(n).padStart(4, '0')}`;
const contractNumber = (n: number) => `CON-${String(n).padStart(4, '0')}`;

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const greeting = (name?: string | null) => `Hi ${name?.trim() || 'there'},`;
const signOff = (businessName: string) => `Thank you,\n${businessName}`;
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join('\n\n');

// ───────────────────────── Documents sent by the user ─────────────────────────

export interface InvoiceEmailInput {
  businessName: string;
  clientName: string;
  number: number;
  title: string;
  currency: string;
  balance: number;
  total: number;
  dueDate: Date | null;
  message?: string;
  link: string | null;
  payable: boolean;
}

export function defaultInvoiceMessage(title: string) {
  return `Please find your invoice for ${title} below.`;
}

export function invoiceEmail(i: InvoiceEmailInput): ComposedEmail {
  const details = [
    `Invoice ${invoiceNumber(i.number)}: ${i.title}`,
    `Total: ${money(i.total, i.currency)}`,
    i.balance !== i.total ? `Balance due: ${money(i.balance, i.currency)}` : null,
    i.dueDate ? `Due: ${longDate(i.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    subject: `Invoice ${invoiceNumber(i.number)} from ${i.businessName}`,
    bodyText: join(
      greeting(i.clientName),
      i.message?.trim() || defaultInvoiceMessage(i.title),
      details,
      i.link && (i.payable ? `View and pay it online: ${i.link}` : `View it online: ${i.link}`),
      signOff(i.businessName),
    ),
    ctaUrl: i.link ?? undefined,
    ctaLabel: i.link ? (i.payable ? 'View & pay invoice' : 'View invoice') : undefined,
  };
}

export interface QuoteEmailInput {
  businessName: string;
  clientName: string;
  number: number;
  title: string;
  currency: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  total: number;
  validUntil: Date | null;
  notes: string | null;
  message?: string;
}

export function defaultQuoteMessage(title: string) {
  return `Thank you for your enquiry. Here is our quotation for ${title}.`;
}

export function quoteEmail(q: QuoteEmailInput): ComposedEmail {
  const lines = q.items.map((it) => `• ${it.description}: ${it.quantity} × ${money(it.unitPrice, q.currency)} = ${money(it.quantity * it.unitPrice, q.currency)}`);
  return {
    subject: `Quotation ${quoteNumber(q.number)} from ${q.businessName}`,
    bodyText: join(
      greeting(q.clientName),
      q.message?.trim() || defaultQuoteMessage(q.title),
      [`Quotation ${quoteNumber(q.number)}: ${q.title}`, ...lines, `Total: ${money(q.total, q.currency)}`].join('\n'),
      q.validUntil ? `This quotation is valid until ${longDate(q.validUntil)}.` : null,
      q.notes ? `Notes:\n${q.notes}` : null,
      'To accept, or if you have any questions, simply reply to this email.',
      signOff(q.businessName),
    ),
  };
}

export interface ContractEmailInput {
  businessName: string;
  clientName: string;
  number: number;
  title: string;
  body: string;
  message?: string;
}

export function defaultContractMessage(title: string) {
  return `Please review the performance agreement for ${title} below.`;
}

export function contractEmail(c: ContractEmailInput): ComposedEmail {
  return {
    subject: `Performance agreement ${contractNumber(c.number)} from ${c.businessName}`,
    bodyText: join(
      greeting(c.clientName),
      c.message?.trim() || defaultContractMessage(c.title),
      'To accept, print and sign a copy and send it back, or reply to this email with any questions.',
      '────────────────────────',
      c.body.trim(),
      '────────────────────────',
      signOff(c.businessName),
    ),
  };
}

// ───────────────────────── Automatic emails ─────────────────────────

export interface PaymentEmailInput {
  businessName: string;
  clientName: string;
  invoiceNumber: number;
  invoiceTitle: string;
  amount: number;
  currency: string;
  balance: number;
  reference: string;
  providerLabel: string;
  link: string | null;
}

export function paymentReceiptEmail(p: PaymentEmailInput): ComposedEmail {
  return {
    subject: `Payment received: ${invoiceNumber(p.invoiceNumber)} (${money(p.amount, p.currency)})`,
    bodyText: join(
      greeting(p.clientName),
      `Thank you! We've received your payment of ${money(p.amount, p.currency)} for invoice ${invoiceNumber(p.invoiceNumber)} (${p.invoiceTitle}).`,
      p.balance > 0.005
        ? `Remaining balance: ${money(p.balance, p.currency)}.`
        : 'This invoice is now fully paid.',
      `Payment reference: ${p.reference} (${p.providerLabel})`,
      p.link && `View the invoice: ${p.link}`,
      signOff(p.businessName),
    ),
    ctaUrl: p.link ?? undefined,
    ctaLabel: p.link ? 'View invoice' : undefined,
  };
}

export function paymentAlertEmail(p: PaymentEmailInput & { recipientName: string; dashboardUrl: string }): ComposedEmail {
  return {
    subject: `${p.clientName} paid ${money(p.amount, p.currency)} for ${invoiceNumber(p.invoiceNumber)}`,
    bodyText: join(
      greeting(p.recipientName),
      `${p.clientName} just paid ${money(p.amount, p.currency)} online for invoice ${invoiceNumber(p.invoiceNumber)} (${p.invoiceTitle}). It has been recorded on the invoice.`,
      p.balance > 0.005 ? `Remaining balance: ${money(p.balance, p.currency)}.` : 'The invoice is now fully paid.',
      `Reference: ${p.reference} (${p.providerLabel})`,
      `Open your invoices: ${p.dashboardUrl}`,
      'ArtBH',
    ),
    ctaUrl: p.dashboardUrl,
    ctaLabel: 'Open invoices',
  };
}

export interface ReminderEmailInput {
  businessName: string;
  clientName: string;
  number: number;
  title: string;
  currency: string;
  balance: number;
  dueDate: Date;
  daysOverdue: number;
  link: string | null;
  payable: boolean;
}

export function reminderEmail(r: ReminderEmailInput): ComposedEmail {
  const days = r.daysOverdue === 1 ? '1 day' : `${r.daysOverdue} days`;
  return {
    subject: `Reminder: invoice ${invoiceNumber(r.number)} from ${r.businessName} is overdue`,
    bodyText: join(
      greeting(r.clientName),
      `This is a friendly reminder that invoice ${invoiceNumber(r.number)} (${r.title}) was due on ${longDate(r.dueDate)}, ${days} ago. The outstanding balance is ${money(r.balance, r.currency)}.`,
      r.link && (r.payable ? `You can view and pay it online: ${r.link}` : `You can view it online: ${r.link}`),
      "If you've already paid, thank you, and please ignore this message. If you have any questions, just reply to this email.",
      signOff(r.businessName),
    ),
    ctaUrl: r.link ?? undefined,
    ctaLabel: r.link ? (r.payable ? 'View & pay invoice' : 'View invoice') : undefined,
  };
}

// ───────────────────────── HTML ─────────────────────────

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Simple, email-client-safe HTML: paragraphs from the text, one button, a footer. Everything user-supplied is escaped. */
export function renderHtml(
  email: { bodyText: string; ctaUrl?: string | null; ctaLabel?: string | null },
  businessName: string,
  footer = `Sent by ${businessName} via ArtBH`,
): string {
  const paragraphs = email.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button =
    email.ctaUrl && /^https?:\/\//i.test(email.ctaUrl)
      ? `<p style="margin:24px 0"><a href="${escapeHtml(email.ctaUrl)}" style="background:#fa5813;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(email.ctaLabel || 'Open')}</a></p>`
      : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:12px;padding:28px;font-size:15px">${paragraphs}${button}</div>
<p style="text-align:center;color:#a1a1aa;font-size:12px;margin:16px 0 0">${escapeHtml(footer)}</p>
</div></body></html>`;
}
