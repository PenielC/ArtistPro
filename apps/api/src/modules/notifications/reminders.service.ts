import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, MONEY_TOLERANCE, toInvoiceView } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { reminderEmail } from './email-templates';
import { EmailService } from './email.service';
import { InboxService } from './inbox.service';

const DAY_MS = 86_400_000;

/** Midnight UTC of the calendar date it currently is in `timeZone`. Due dates are stored as UTC midnights. */
export function todayIn(timeZone: string, now: Date): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Date.parse(`${ymd}T00:00:00Z`);
}

/**
 * Which reminder an invoice is due for: the latest configured day it has
 * reached. Catch-up by design: if the server missed a day, the next run still
 * sends it, and the dedupe key stops the same reminder going twice. It never
 * sends several at once (an invoice 20 days overdue gets the 14-day one only).
 */
export function reminderStep(daysOverdue: number, reminderDays: number[]): number | null {
  const reached = reminderDays.filter((d) => d <= daysOverdue);
  return reached.length ? Math.max(...reached) : null;
}

export interface ReminderRunResult {
  sent: number;
  skippedNoEmail: number;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
    private readonly payments: PaymentsService,
    private readonly inbox: InboxService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('REMINDERS_TZ') ?? 'Africa/Harare';
  }

  /** The scheduled run: every organisation that has reminders turned on. */
  async runForAll(now = new Date()): Promise<ReminderRunResult> {
    const orgs = await this.prisma.organization.findMany({ where: { reminderEnabled: true, suspendedAt: null }, select: { id: true } });
    const total: ReminderRunResult = { sent: 0, skippedNoEmail: 0 };
    for (const org of orgs) {
      try {
        const r = await this.runForOrganization(org.id, now);
        total.sent += r.sent;
        total.skippedNoEmail += r.skippedNoEmail;
      } catch (err) {
        // One organisation's problem must not stop everyone else's reminders.
        this.logger.error(`Reminders failed for organisation ${org.id}`, err as Error);
      }
    }
    this.logger.log(`Overdue reminders: ${total.sent} sent across ${orgs.length} organisation(s)`);
    return total;
  }

  async runForOrganization(organizationId: string, now = new Date()): Promise<ReminderRunResult> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, reminderDays: true },
    });
    const today = todayIn(this.timeZone, now);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date(today) },
      },
      include: { ...INVOICE_INCLUDE, client: { select: { email: true } } },
    });

    const replyTo = await this.emails.ownerReplyTo(organizationId);
    const result: ReminderRunResult = { sent: 0, skippedNoEmail: 0 };
    for (const invoice of invoices) {
      const { balance } = toInvoiceView(invoice);
      if (balance <= MONEY_TOLERANCE || !invoice.dueDate) continue;
      const daysOverdue = Math.floor((today - Date.parse(invoice.dueDate.toISOString().slice(0, 10) + 'T00:00:00Z')) / DAY_MS);
      const step = reminderStep(daysOverdue, org.reminderDays);
      if (step === null) continue;

      const to = invoice.clientEmail ?? invoice.client?.email;
      if (!to) {
        result.skippedNoEmail++;
        continue;
      }
      const link = await this.payments.shareableLink(organizationId, invoice.id);
      const composed = reminderEmail({
        businessName: org.name,
        clientName: invoice.clientName,
        number: invoice.number,
        title: invoice.title,
        currency: invoice.currency,
        balance,
        dueDate: invoice.dueDate,
        daysOverdue,
        link: link?.url ?? null,
        payable: link?.payable ?? false,
      });
      const created = await this.emails.create({
        ...composed,
        organizationId,
        kind: 'INVOICE_REMINDER',
        toEmail: to,
        toName: invoice.clientName,
        replyTo,
        invoiceId: invoice.id,
        dedupeKey: `reminder:${invoice.id}:${step}`,
      });
      if (created) result.sent++;
    }

    if (result.sent > 0) {
      await this.inbox.notifyOrganization(
        organizationId,
        {
          type: 'REMINDERS_SENT',
          title: `Sent ${result.sent} overdue ${result.sent === 1 ? 'reminder' : 'reminders'}`,
          body: result.skippedNoEmail ? `${result.skippedNoEmail} overdue invoice(s) have no client email, so no reminder could be sent.` : undefined,
          link: '/invoices',
        },
        [UserRole.OWNER, UserRole.FINANCE],
      );
    }
    return result;
  }
}
