import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

const MAX_NUMBER_ATTEMPTS = 3;

type QuoteWithItems = Prisma.QuoteGetPayload<{ include: { items: true } }>;

function withTotal(quote: QuoteWithItems) {
  const items = quote.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) }));
  const total = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
  return { ...quote, items, total };
}

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateQuoteDto) {
    if (dto.artistId) {
      const artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId } });
      if (!artist) throw new NotFoundException('Artist not found.');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId } });
      if (!client) throw new NotFoundException('Client not found.');
    }
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({ where: { id: dto.bookingId, organizationId } });
      if (!booking) throw new NotFoundException('Booking not found.');
    }

    // Numbers are per-organisation (Q-0001, Q-0002 …). The unique
    // (organizationId, number) index guards against two concurrent creates
    // picking the same number; on a collision we simply pick again.
    for (let attempt = 1; ; attempt++) {
      const last = await this.prisma.quote.findFirst({
        where: { organizationId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      try {
        const quote = await this.prisma.quote.create({
          data: {
            organizationId,
            artistId: dto.artistId,
            clientId: dto.clientId,
            bookingId: dto.bookingId,
            number,
            title: dto.title,
            clientName: dto.clientName,
            clientEmail: dto.clientEmail,
            currency: dto.currency ?? 'USD',
            validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
            notes: dto.notes,
            items: {
              create: dto.items.map((item, position) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                position,
              })),
            },
          },
          include: { items: { orderBy: { position: 'asc' } } },
        });
        return withTotal(quote);
      } catch (err) {
        const isNumberCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isNumberCollision || attempt >= MAX_NUMBER_ATTEMPTS) throw err;
      }
    }
  }

  async findAll(organizationId: string) {
    const quotes = await this.prisma.quote.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    return quotes.map(withTotal);
  }

  async findOne(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quote not found.');
    return withTotal(quote);
  }

  async updateStatus(organizationId: string, id: string, status: QuoteStatus) {
    await this.findOne(organizationId, id);
    const quote = await this.prisma.quote.update({
      where: { id },
      data: { status },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    return withTotal(quote);
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.quote.delete({ where: { id } });
    return { deleted: true };
  }
}
