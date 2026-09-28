import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiFeature } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, MONEY_TOLERANCE, toInvoiceView } from '../invoices/invoices.service';
import type { AiEffort } from './ai.types';
import type { ContentRequestDto, DraftRequestDto, PricingRequestDto } from './dto/ai.dto';
import { BRIEFING_SYSTEM, contentSystem, draftSystem, PRICING_SYSTEM, withData } from './prompts';

/** Everything needed to run one generation, built before any response is streamed. */
export interface PreparedGeneration {
  feature: AiFeature;
  variant?: string;
  subjectType?: string;
  subjectId?: string;
  instructions?: string;
  system: string;
  prompt: string;
  effort: AiEffort;
  maxTokens: number;
  demoText: string;
}

const DAY = 86_400_000;
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const invNo = (n: number) => `INV-${String(n).padStart(4, '0')}`;
const quoteNo = (n: number) => `Q-${String(n).padStart(4, '0')}`;
const conNo = (n: number) => `CON-${String(n).padStart(4, '0')}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const extra = (instructions?: string) => (instructions?.trim() ? `\n\nExtra instructions from the user: ${instructions.trim()}` : '');

/**
 * Gathers the organisation's own data for each AI feature. Everything is
 * scoped by organisationId; nothing from another organisation can reach a prompt.
 */
@Injectable()
export class AiContextService {
  constructor(private readonly prisma: PrismaService) {}

  private org(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, currency: true } });
  }

  // ─────────────────────────── Briefing ───────────────────────────

  async briefing(organizationId: string, now = new Date()): Promise<PreparedGeneration> {
    const org = await this.org(organizationId);
    const today = new Date(`${isoDay(now)}T00:00:00Z`);
    const [bookings, enquiries, invoices, quotes, contracts, artists] = await Promise.all([
      this.prisma.booking.findMany({
        where: { organizationId, eventDate: { gte: today, lt: new Date(today.getTime() + 60 * DAY) }, status: { notIn: ['COMPLETED', 'PAYMENT_RECEIVED'] } },
        orderBy: { eventDate: 'asc' },
        take: 30,
      }),
      this.prisma.booking.findMany({
        where: { organizationId, status: { in: ['NEW_ENQUIRY', 'QUALIFIED'] }, createdAt: { lt: new Date(now.getTime() - 3 * DAY) } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      this.prisma.invoice.findMany({ where: { organizationId, status: { in: ['SENT', 'PARTIALLY_PAID'] } }, include: INVOICE_INCLUDE, take: 100 }),
      this.prisma.quote.findMany({ where: { organizationId, status: 'SENT', updatedAt: { lt: new Date(now.getTime() - 7 * DAY) } }, take: 20 }),
      this.prisma.contract.findMany({ where: { organizationId, status: 'SENT' }, take: 20 }),
      this.prisma.artist.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    ]);
    const artistName = new Map(artists.map((a) => [a.id, a.name]));

    const outstanding = invoices
      .map((inv) => {
        const v = toInvoiceView(inv, now);
        const daysOverdue = inv.dueDate && inv.dueDate < today ? Math.floor((today.getTime() - inv.dueDate.getTime()) / DAY) : 0;
        return { invoice: invNo(inv.number), client: inv.clientName, title: inv.title, currency: inv.currency, total: v.total, balance: v.balance, dueDate: isoDay(inv.dueDate), daysOverdue };
      })
      .filter((i) => i.balance > MONEY_TOLERANCE)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const totals: Record<string, { outstanding: number; overdue: number }> = {};
    for (const i of outstanding) {
      totals[i.currency] ??= { outstanding: 0, overdue: 0 };
      totals[i.currency].outstanding = round2(totals[i.currency].outstanding + i.balance);
      if (i.daysOverdue > 0) totals[i.currency].overdue = round2(totals[i.currency].overdue + i.balance);
    }

    const data = {
      business: org.name,
      baseCurrency: org.currency,
      today: isoDay(now),
      upcomingBookings: bookings.map((b) => ({
        client: b.clientName,
        eventType: b.eventType,
        date: isoDay(b.eventDate),
        venue: b.venue,
        fee: b.fee ? Number(b.fee) : null,
        currency: b.currency,
        status: b.status,
        artist: b.artistId ? artistName.get(b.artistId) ?? null : null,
      })),
      enquiriesWaitingOver3Days: enquiries.map((b) => ({
        client: b.clientName,
        eventType: b.eventType,
        date: isoDay(b.eventDate),
        status: b.status,
        receivedDaysAgo: Math.floor((now.getTime() - b.createdAt.getTime()) / DAY),
      })),
      outstandingInvoices: outstanding,
      moneyTotalsByCurrency: totals,
      quotesAwaitingReplyOver7Days: quotes.map((q) => ({ quote: quoteNo(q.number), client: q.clientName, title: q.title, sentDaysAgo: Math.floor((now.getTime() - q.updatedAt.getTime()) / DAY) })),
      contractsAwaitingSignature: contracts.map((c) => ({ contract: conNo(c.number), client: c.clientName, title: c.title, eventDate: isoDay(c.eventDate) })),
    };

    const overdue = outstanding.filter((i) => i.daysOverdue > 0);
    const demoText = [
      `Briefing for ${org.name}.`,
      `${bookings.length} upcoming booking(s) in the next 60 days, ${enquiries.length} enquiry(ies) waiting over 3 days,`,
      `${outstanding.length} unpaid invoice(s) of which ${overdue.length} overdue${overdue[0] ? ` (most overdue: ${overdue[0].invoice} for ${overdue[0].client})` : ''},`,
      `${quotes.length} quote(s) awaiting a reply and ${contracts.length} contract(s) awaiting signature.`,
    ].join(' ');

    return {
      feature: 'BRIEFING',
      system: BRIEFING_SYSTEM,
      prompt: withData("Write today's briefing.", data),
      effort: 'medium',
      maxTokens: 16_000,
      demoText,
    };
  }

  // ─────────────────────────── Drafts ───────────────────────────

  async draft(organizationId: string, userId: string, dto: DraftRequestDto, now = new Date()): Promise<PreparedGeneration> {
    const [org, user] = await Promise.all([
      this.org(organizationId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true } }),
    ]);
    const sender = { business: org.name, senderFirstName: user.firstName };
    let variant: string;
    let data: Record<string, unknown>;
    let clientName: string;

    if (dto.document === 'INVOICE') {
      const inv = await this.prisma.invoice.findFirst({ where: { id: dto.documentId, organizationId }, include: INVOICE_INCLUDE });
      if (!inv) throw new NotFoundException('Invoice not found.');
      const v = toInvoiceView(inv, now);
      const daysOverdue = inv.dueDate && inv.dueDate < now ? Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY) : 0;
      variant = v.amountPaid > 0 || daysOverdue > 0 ? 'INVOICE_FOLLOW_UP' : 'INVOICE_COVER';
      clientName = inv.clientName;
      data = { ...sender, invoice: invNo(inv.number), client: inv.clientName, title: inv.title, currency: inv.currency, total: v.total, amountPaid: v.amountPaid, balance: v.balance, issueDate: isoDay(inv.issueDate), dueDate: isoDay(inv.dueDate), daysOverdue, notes: inv.notes };
    } else if (dto.document === 'QUOTE') {
      const q = await this.prisma.quote.findFirst({ where: { id: dto.documentId, organizationId }, include: { items: { orderBy: { position: 'asc' } } } });
      if (!q) throw new NotFoundException('Quote not found.');
      variant = 'QUOTE_COVER';
      clientName = q.clientName;
      const items = q.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: Number(i.unitPrice) }));
      data = { ...sender, quote: quoteNo(q.number), client: q.clientName, title: q.title, currency: q.currency, items, total: round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)), validUntil: isoDay(q.validUntil), notes: q.notes };
    } else if (dto.document === 'CONTRACT') {
      const c = await this.prisma.contract.findFirst({ where: { id: dto.documentId, organizationId } });
      if (!c) throw new NotFoundException('Contract not found.');
      variant = 'CONTRACT_NOTE';
      clientName = c.clientName;
      data = { ...sender, contract: conNo(c.number), client: c.clientName, artist: c.artistName, title: c.title, eventType: c.eventType, eventDate: isoDay(c.eventDate), venue: c.venue, currency: c.currency, fee: Number(c.fee), deposit: Number(c.depositAmount), paymentTerms: c.paymentTerms };
    } else {
      const b = await this.prisma.booking.findFirst({ where: { id: dto.documentId, organizationId }, include: { artist: { select: { name: true } } } });
      if (!b) throw new NotFoundException('Booking not found.');
      variant = 'ENQUIRY_REPLY';
      clientName = b.clientName;
      data = { ...sender, client: b.clientName, artist: b.artist?.name ?? null, eventType: b.eventType, eventDate: isoDay(b.eventDate), venue: b.venue, fee: b.fee ? Number(b.fee) : null, currency: b.currency, status: b.status, enquiryNotes: b.notes };
    }

    const demoByVariant: Record<string, string> = {
      INVOICE_COVER: `Here is your invoice from ${org.name}. Please let us know if you have any questions.`,
      INVOICE_FOLLOW_UP: `Just a friendly follow-up on the outstanding balance of ${String(data.currency)} ${Number(data.balance).toFixed(2)}. Could you let us know when we can expect payment?`,
      QUOTE_COVER: `Thank you for your enquiry. Our quotation is below; let us know if you'd like to go ahead.`,
      CONTRACT_NOTE: `Please review the attached agreement, sign it and send a copy back to confirm the booking.`,
      ENQUIRY_REPLY: `Hi ${clientName}, thank you for your enquiry! Could you share the date, venue and duration so we can send a quote? ${org.name}`,
    };

    return {
      feature: 'DRAFT',
      variant,
      subjectType: dto.document,
      subjectId: dto.documentId,
      instructions: dto.instructions?.trim() || undefined,
      system: draftSystem(variant),
      prompt: withData(`Write the message.${extra(dto.instructions)}`, data),
      effort: 'low',
      maxTokens: 8_000,
      demoText: demoByVariant[variant],
    };
  }

  // ─────────────────────────── Content ───────────────────────────

  async content(organizationId: string, dto: ContentRequestDto): Promise<PreparedGeneration> {
    if (dto.type === 'PRESS_RELEASE' && !dto.topic?.trim()) {
      throw new BadRequestException('Tell the AI what the press release is about (e.g. a new single, a festival slot).');
    }
    const artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId }, include: { epk: true } });
    if (!artist) throw new NotFoundException('Artist not found.');
    const org = await this.org(organizationId);

    const data = {
      business: org.name,
      artist: {
        name: artist.name,
        category: artist.category,
        genres: artist.genres,
        location: artist.location,
        tagline: artist.tagline,
        currentBio: artist.bio,
        bookingEmail: artist.bookingEmail,
        bookingPhone: artist.bookingPhone,
      },
      pressKit: artist.epk
        ? {
            highlights: artist.epk.achievements,
            discography: artist.epk.discography,
            notablePerformances: artist.epk.performances,
            pressQuotes: artist.epk.pressQuotes,
          }
        : null,
    };
    const request = [
      dto.topic?.trim() && `Topic: ${dto.topic.trim()}`,
      dto.type === 'SOCIAL_POSTS' && `Platform: ${dto.platform?.trim() || 'Instagram'}`,
      'Write it now.',
    ]
      .filter(Boolean)
      .join('\n');

    const demo: Record<string, string> = {
      ARTIST_BIO: `${artist.name} is a${artist.category ? ` ${artist.category.toLowerCase()}` : 'n artist'}${artist.location ? ` based in ${artist.location}` : ''}${artist.genres.length ? `, known for ${artist.genres.join(', ')}` : ''}.`,
      EPK_TAGLINE: `${artist.name}${artist.genres[0] ? `: ${artist.genres[0]} for every stage` : ': live, unforgettable'}`,
      PRESS_RELEASE: `# ${artist.name}: ${dto.topic ?? ''}\n\nA demo press release about "${dto.topic ?? ''}".`,
      SOCIAL_POSTS: `1. ${artist.name} is ready for the weekend! #live\n2. Book ${artist.name} for your next event. #music\n3. Thank you for the love! #grateful`,
    };

    return {
      feature: 'CONTENT',
      variant: dto.type,
      subjectType: 'ARTIST',
      subjectId: artist.id,
      instructions: [dto.topic, dto.instructions].filter((s) => s?.trim()).join(' | ') || undefined,
      system: contentSystem(dto.type),
      prompt: withData(`${request}${extra(dto.instructions)}`, data),
      effort: dto.type === 'PRESS_RELEASE' ? 'medium' : 'low',
      maxTokens: 12_000,
      demoText: demo[dto.type],
    };
  }

  // ─────────────────────────── Pricing ───────────────────────────

  async pricing(organizationId: string, dto: PricingRequestDto): Promise<PreparedGeneration> {
    if (dto.artistId) {
      const artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId }, select: { id: true } });
      if (!artist) throw new NotFoundException('Artist not found.');
    }
    const org = await this.org(organizationId);
    const byArtist = dto.artistId ? { artistId: dto.artistId } : {};
    const [quotes, invoices, bookings] = await Promise.all([
      this.prisma.quote.findMany({ where: { organizationId, ...byArtist }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 80 }),
      this.prisma.invoice.findMany({ where: { organizationId, ...byArtist, status: { not: 'DRAFT' } }, include: INVOICE_INCLUDE, orderBy: { createdAt: 'desc' }, take: 80 }),
      this.prisma.booking.findMany({ where: { organizationId, ...byArtist, fee: { not: null } }, orderBy: { createdAt: 'desc' }, take: 80 }),
    ]);

    const history = {
      quotes: quotes.map((q) => ({
        quote: quoteNo(q.number),
        title: q.title,
        status: q.status,
        currency: q.currency,
        total: round2(q.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0)),
        date: isoDay(q.createdAt),
      })),
      invoices: invoices.map((inv) => {
        const v = toInvoiceView(inv);
        return { invoice: invNo(inv.number), title: inv.title, status: inv.status, currency: inv.currency, total: v.total, paid: v.amountPaid, date: isoDay(inv.issueDate) };
      }),
      bookings: bookings.map((b) => ({ eventType: b.eventType, venue: b.venue, fee: Number(b.fee), currency: b.currency, status: b.status, date: isoDay(b.eventDate) })),
    };
    const dataPoints = history.quotes.length + history.invoices.length + history.bookings.length;
    const requestLines = [
      `Price this booking: ${dto.eventType}`,
      dto.eventDate && `Date: ${dto.eventDate.slice(0, 10)}`,
      dto.location && `Location: ${dto.location}`,
      dto.durationMinutes && `Duration: ${dto.durationMinutes} minutes`,
      `Currency: ${dto.currency ?? org.currency}`,
      dto.notes && `Notes: ${dto.notes}`,
    ].filter(Boolean);

    return {
      feature: 'PRICING',
      subjectType: dto.artistId ? 'ARTIST' : undefined,
      subjectId: dto.artistId,
      instructions: requestLines.join(' | '),
      system: PRICING_SYSTEM,
      prompt: withData(requestLines.join('\n'), { business: org.name, baseCurrency: org.currency, history }),
      effort: 'medium',
      maxTokens: 16_000,
      demoText:
        dataPoints < 3
          ? `**Not enough history to suggest a price yet**: only ${dataPoints} past item(s) found.`
          : `**Suggested range:** based on ${dataPoints} past quotes, invoices and bookings.`,
    };
  }
}
