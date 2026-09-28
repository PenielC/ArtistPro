import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: {
    client: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      client: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ClientsService(prisma as unknown as PrismaService);
  });

  it('creates a client scoped to the organization', async () => {
    prisma.client.create.mockResolvedValue({ id: 'client-1' });

    await service.create('org-1', { name: 'Chipo Weddings', email: 'chipo@weddings.co.zw' });

    expect(prisma.client.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', name: 'Chipo Weddings', email: 'chipo@weddings.co.zw' },
    });
  });

  it('lists only the given organization\'s clients, with booking counts', async () => {
    prisma.client.findMany.mockResolvedValue([]);

    await service.findAll('org-1');

    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bookings: true } } },
    });
  });

  it('throws NotFoundException for a client in a different organization', async () => {
    prisma.client.findFirst.mockResolvedValue(null);

    await expect(service.findOne('org-1', 'client-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not update a client it cannot confirm belongs to the organization', async () => {
    prisma.client.findFirst.mockResolvedValue(null);

    await expect(service.update('org-1', 'client-1', { name: 'New Name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('updates a client once ownership is confirmed', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
    prisma.client.update.mockResolvedValue({ id: 'client-1', name: 'New Name' });

    const result = await service.update('org-1', 'client-1', { name: 'New Name' });

    expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: 'client-1' }, data: { name: 'New Name' } });
    expect(result.name).toBe('New Name');
  });

  it('does not delete a client it cannot confirm belongs to the organization', async () => {
    prisma.client.findFirst.mockResolvedValue(null);

    await expect(service.remove('org-1', 'client-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.client.delete).not.toHaveBeenCalled();
  });

  it('deletes a client once ownership is confirmed', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });

    const result = await service.remove('org-1', 'client-1');

    expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'client-1' } });
    expect(result).toEqual({ deleted: true });
  });
});
