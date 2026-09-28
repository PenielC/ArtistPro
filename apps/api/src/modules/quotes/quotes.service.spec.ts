import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../../common/prisma/prisma.service';

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    organizationId: 'org-1',
    number: 1,
    items: [
      { id: 'i1', quoteId: 'quote-1', description: 'Performance', quantity: 1, unitPrice: '800.00', position: 0 },
      { id: 'i2', quoteId: 'quote-1', description: 'Sound engineer', quantity: 2, unitPrice: '75.50', position: 1 },
    ],
    ...overrides,
  };
}

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: {
    quote: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    artist: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
  };

  const baseDto = {
    title: 'Wedding performance',
    clientName: 'Chipo Weddings',
    items: [{ description: 'Performance', quantity: 1, unitPrice: 800 }],
  };

  beforeEach(() => {
    prisma = {
      quote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      artist: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
    };
    service = new QuotesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects an artist from another organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, artistId: 'artist-x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'artist-x', organizationId: 'org-1' });
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('links the quote to an artist in the organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1', name: 'Tamy Moyo' });
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(quoteRow());

      await service.create('org-1', { ...baseDto, artistId: 'artist-1' });

      expect(prisma.quote.create.mock.calls[0][0].data.artistId).toBe('artist-1');
    });

    it('numbers the first quote in an organisation as 1 and defaults currency to USD', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(quoteRow());

      await service.create('org-1', baseDto);

      const data = prisma.quote.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe('org-1');
      expect(data.number).toBe(1);
      expect(data.currency).toBe('USD');
      expect(data.items.create).toEqual([{ description: 'Performance', quantity: 1, unitPrice: 800, position: 0 }]);
    });

    it('numbers the next quote after the organisation\'s highest existing number', async () => {
      prisma.quote.findFirst.mockResolvedValue({ number: 7 });
      prisma.quote.create.mockResolvedValue(quoteRow({ number: 8 }));

      await service.create('org-1', baseDto);

      expect(prisma.quote.create.mock.calls[0][0].data.number).toBe(8);
    });

    it('computes the total from quantity x unit price across all items', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(quoteRow());

      const result = await service.create('org-1', baseDto);

      // 1 x 800.00 + 2 x 75.50 = 951.00
      expect(result.total).toBe(951);
      expect(result.items[1].unitPrice).toBe(75.5);
    });

    it('retries with a fresh number when a concurrent create took the same one', async () => {
      const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.quote.findFirst.mockResolvedValueOnce({ number: 1 }).mockResolvedValueOnce({ number: 2 });
      prisma.quote.create.mockRejectedValueOnce(collision).mockResolvedValueOnce(quoteRow({ number: 3 }));

      const result = await service.create('org-1', baseDto);

      expect(prisma.quote.create).toHaveBeenCalledTimes(2);
      expect(prisma.quote.create.mock.calls[1][0].data.number).toBe(3);
      expect(result.number).toBe(3);
    });

    it('gives up and rethrows after repeated number collisions', async () => {
      const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.quote.findFirst.mockResolvedValue({ number: 1 });
      prisma.quote.create.mockRejectedValue(collision);

      await expect(service.create('org-1', baseDto)).rejects.toBe(collision);
      expect(prisma.quote.create).toHaveBeenCalledTimes(3);
    });

    it('does not swallow unrelated database errors', async () => {
      const boom = new Error('connection lost');
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockRejectedValue(boom);

      await expect(service.create('org-1', baseDto)).rejects.toBe(boom);
      expect(prisma.quote.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a clientId from a different organisation', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, clientId: 'other-orgs-client' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('rejects a bookingId from a different organisation', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, bookingId: 'other-orgs-booking' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('scopes to the organisation and returns totals', async () => {
      prisma.quote.findMany.mockResolvedValue([quoteRow()]);

      const result = await service.findAll('org-1');

      expect(prisma.quote.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1' });
      expect(result[0].total).toBe(951);
    });
  });

  describe('findOne / updateStatus / remove', () => {
    it('throws NotFoundException for a quote in another organisation', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'quote-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not update the status of a quote it cannot confirm belongs to the organisation', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('org-1', 'quote-1', 'SENT')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.quote.update).not.toHaveBeenCalled();
    });

    it('updates the status once ownership is confirmed', async () => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow());
      prisma.quote.update.mockResolvedValue(quoteRow({ status: 'SENT' }));

      const result = await service.updateStatus('org-1', 'quote-1', 'SENT');

      expect(prisma.quote.update.mock.calls[0][0].data).toEqual({ status: 'SENT' });
      expect(result.status).toBe('SENT');
    });

    it('does not delete a quote it cannot confirm belongs to the organisation', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'quote-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.quote.delete).not.toHaveBeenCalled();
    });

    it('deletes a quote once ownership is confirmed', async () => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow());

      const result = await service.remove('org-1', 'quote-1');

      expect(prisma.quote.delete).toHaveBeenCalledWith({ where: { id: 'quote-1' } });
      expect(result).toEqual({ deleted: true });
    });
  });
});
