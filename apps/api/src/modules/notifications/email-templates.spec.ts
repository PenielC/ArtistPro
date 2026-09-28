import { contractEmail, invoiceEmail, paymentReceiptEmail, quoteEmail, reminderEmail, renderHtml } from './email-templates';

const invoice = {
  businessName: 'Moyo Management',
  clientName: 'Tariro Events',
  number: 7,
  title: 'Wedding performance',
  currency: 'USD',
  total: 1000,
  balance: 600,
  dueDate: new Date('2026-10-05T00:00:00Z'),
  link: 'https://app.example.com/pay/tok',
  payable: true,
};

describe('email templates', () => {
  it('builds an invoice email with the amounts, due date and pay link', () => {
    const email = invoiceEmail(invoice);
    expect(email.subject).toBe('Invoice INV-0007 from Moyo Management');
    expect(email.bodyText).toContain('Hi Tariro Events,');
    expect(email.bodyText).toContain('Please find your invoice for Wedding performance below.');
    expect(email.bodyText).toContain('Total: $1,000.00');
    expect(email.bodyText).toContain('Balance due: $600.00');
    expect(email.bodyText).toContain('Due: 5 October 2026');
    expect(email.bodyText).toContain('View and pay it online: https://app.example.com/pay/tok');
    expect(email).toMatchObject({ ctaUrl: 'https://app.example.com/pay/tok', ctaLabel: 'View & pay invoice' });
  });

  it('uses the personal message and says "view" when online payment is not available', () => {
    const email = invoiceEmail({ ...invoice, balance: 1000, payable: false, message: 'Great working with you!' });
    expect(email.bodyText).toContain('Great working with you!');
    expect(email.bodyText).not.toContain('Balance due');
    expect(email.bodyText).toContain('View it online:');
    expect(email.ctaLabel).toBe('View invoice');
  });

  it('lists quote items with the total and validity', () => {
    const email = quoteEmail({
      businessName: 'Moyo Management',
      clientName: 'Tariro Events',
      number: 3,
      title: 'Wedding',
      currency: 'USD',
      items: [{ description: 'Performance', quantity: 2, unitPrice: 450 }],
      total: 900,
      validUntil: new Date('2026-11-01T00:00:00Z'),
      notes: null,
    });
    expect(email.subject).toBe('Quotation Q-0003 from Moyo Management');
    expect(email.bodyText).toContain('• Performance: 2 × $450.00 = $900.00');
    expect(email.bodyText).toContain('valid until 1 November 2026');
  });

  it('includes the full frozen contract text', () => {
    const email = contractEmail({ businessName: 'M', clientName: 'T', number: 1, title: 'Gig', body: 'PERFORMANCE AGREEMENT\nClause 1.' });
    expect(email.subject).toBe('Performance agreement CON-0001 from M');
    expect(email.bodyText).toContain('PERFORMANCE AGREEMENT\nClause 1.');
  });

  it('receipt says fully paid or states the remaining balance', () => {
    const base = { businessName: 'M', clientName: 'T', invoiceNumber: 7, invoiceTitle: 'Gig', amount: 400, currency: 'USD', reference: 'R1', providerLabel: 'Paynow', link: null };
    expect(paymentReceiptEmail({ ...base, balance: 600 }).bodyText).toContain('Remaining balance: $600.00.');
    expect(paymentReceiptEmail({ ...base, balance: 0 }).bodyText).toContain('This invoice is now fully paid.');
  });

  it('reminder states how overdue the invoice is', () => {
    const email = reminderEmail({ ...invoice, dueDate: invoice.dueDate, daysOverdue: 7 });
    expect(email.subject).toBe('Reminder: invoice INV-0007 from Moyo Management is overdue');
    expect(email.bodyText).toContain('was due on 5 October 2026, 7 days ago');
    expect(reminderEmail({ ...invoice, daysOverdue: 1 }).bodyText).toContain('1 day ago');
  });

  describe('renderHtml', () => {
    it('escapes user-supplied text so it cannot inject markup', () => {
      const html = renderHtml({ bodyText: 'Hi <script>alert(1)</script> & "friends"' }, 'Evil <b>Co</b>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;friends&quot;');
      expect(html).toContain('Sent by Evil &lt;b&gt;Co&lt;/b&gt; via ArtBH');
    });

    it('turns paragraphs and line breaks into HTML', () => {
      const html = renderHtml({ bodyText: 'One\nline two\n\nPara two' }, 'M');
      expect(html).toContain('>One<br>line two</p>');
      expect(html).toContain('>Para two</p>');
    });

    it('renders a button only for an http(s) link', () => {
      expect(renderHtml({ bodyText: 'x', ctaUrl: 'https://a.example/pay', ctaLabel: 'Pay' }, 'M')).toContain('href="https://a.example/pay"');
      expect(renderHtml({ bodyText: 'x', ctaUrl: 'javascript:alert(1)', ctaLabel: 'Pay' }, 'M')).not.toContain('href=');
    });
  });
});
