import { NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: {
    booking: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    artist: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      booking: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      artist: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
    };
    service = new BookingsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects an artist from another organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { clientName: 'Jane Client', artistId: 'artist-x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'artist-x', organizationId: 'org-1' });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('links the booking to an artist in the organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1', name: 'Tamy Moyo' });
      prisma.booking.create.mockResolvedValue({ id: 'booking-1' });

      await service.create('org-1', { clientName: 'Jane Client', artistId: 'artist-1' });

      expect(prisma.booking.create.mock.calls[0][0].data.artistId).toBe('artist-1');
    });

    it('creates a booking scoped to the organization, defaulting currency to USD', async () => {
      prisma.booking.create.mockResolvedValue({ id: 'booking-1' });

      await service.create('org-1', { clientName: 'Jane Client' });

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          clientName: 'Jane Client',
          currency: 'USD',
        }),
      });
    });

    it('rejects a clientId that belongs to a different organization', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { clientName: 'Jane Client', clientId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('links the booking to a client that belongs to the organization', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
      prisma.booking.create.mockResolvedValue({ id: 'booking-1' });

      await service.create('org-1', { clientName: 'Jane Client', clientId: 'client-1' });

      expect(prisma.booking.create.mock.calls[0][0].data.clientId).toBe('client-1');
    });

    it('parses an eventDate string into a Date', async () => {
      prisma.booking.create.mockResolvedValue({ id: 'booking-1' });

      await service.create('org-1', { clientName: 'Jane Client', eventDate: '2026-12-25' });

      const call = prisma.booking.create.mock.calls[0][0];
      expect(call.data.eventDate).toBeInstanceOf(Date);
    });
  });

  describe('findAll', () => {
    it('scopes the query to the given organization', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.findAll('org-1');

      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the booking does not exist in this organization', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'booking-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the booking when it belongs to the organization', async () => {
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1', organizationId: 'org-1' });

      const result = await service.findOne('org-1', 'booking-1');

      expect(result.id).toBe('booking-1');
    });
  });

  describe('reschedule', () => {
    it('moves a booking in the organisation to a new day', async () => {
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1' });
      prisma.booking.update.mockResolvedValue({ id: 'booking-1' });
      await service.reschedule('org-1', 'booking-1', '2026-12-05');
      expect(prisma.booking.findFirst.mock.calls[0][0].where).toEqual({ id: 'booking-1', organizationId: 'org-1' });
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { eventDate: new Date('2026-12-05T00:00:00Z') } });
    });

    it("refuses another organisation's booking and impossible dates", async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.reschedule('org-1', 'booking-1', '2026-12-05')).rejects.toBeInstanceOf(NotFoundException);
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1' });
      await expect(service.reschedule('org-1', 'booking-1', '2026-02-30')).rejects.toThrow('2026-02-30 is not a real date.');
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException for a booking belonging to a different organization', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('org-1', 'booking-1', 'QUALIFIED')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('updates the status once ownership is confirmed', async () => {
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1', organizationId: 'org-1' });
      prisma.booking.update.mockResolvedValue({ id: 'booking-1', status: 'QUALIFIED' });

      const result = await service.updateStatus('org-1', 'booking-1', 'QUALIFIED');

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { status: 'QUALIFIED' },
      });
      expect(result.status).toBe('QUALIFIED');
    });
  });
});
