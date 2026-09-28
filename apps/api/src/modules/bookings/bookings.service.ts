import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBookingDto) {
    if (dto.artistId) {
      const artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId } });
      if (!artist) throw new NotFoundException('Artist not found.');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, organizationId },
      });
      if (!client) {
        throw new NotFoundException('Client not found.');
      }
    }

    return this.prisma.booking.create({
      data: {
        organizationId,
        artistId: dto.artistId,
        clientId: dto.clientId,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        eventType: dto.eventType,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
        venue: dto.venue,
        fee: dto.fee,
        currency: dto.currency ?? 'USD',
        notes: dto.notes,
      },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.booking.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, organizationId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }
    return booking;
  }

  /** Moves the event to another day (the calendar's drag-to-reschedule). Linked documents are not changed. */
  async reschedule(organizationId: string, id: string, eventDate: string) {
    await this.findOne(organizationId, id);
    const date = new Date(`${eventDate}T00:00:00Z`);
    // Rejects impossible days like 2026-02-30 as well as garbage.
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== eventDate) {
      throw new BadRequestException(`${eventDate} is not a real date.`);
    }
    return this.prisma.booking.update({ where: { id }, data: { eventDate: date } });
  }

  async updateStatus(organizationId: string, id: string, status: BookingStatus) {
    await this.findOne(organizationId, id);
    return this.prisma.booking.update({
      where: { id },
      data: { status },
    });
  }
}
