import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let prisma: {
    organization: { findUnique: jest.Mock; update: jest.Mock };
    invoice: { count: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      organization: { findUnique: jest.fn(), update: jest.fn() },
      invoice: { count: jest.fn() },
    };
    service = new OrganizationService(prisma as unknown as PrismaService);
  });

  it('changes the base currency when the organisation has no invoices yet', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', currency: 'USD' });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'Acme', currency: 'ZAR' });

    const result = await service.updateCurrency('org-1', 'ZAR');

    expect(prisma.organization.update.mock.calls[0][0].data).toEqual({ currency: 'ZAR' });
    expect(result.currency).toBe('ZAR');
  });

  it('refuses to change the base currency once invoices exist', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', currency: 'USD' });
    prisma.invoice.count.mockResolvedValue(3);

    await expect(service.updateCurrency('org-1', 'ZAR')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('is a harmless no-op when asked to set the currency it already has, even with invoices', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', currency: 'USD' });

    const result = await service.updateCurrency('org-1', 'USD');

    expect(result.currency).toBe('USD');
    expect(prisma.invoice.count).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown organisation', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.updateCurrency('org-x', 'ZAR')).rejects.toBeInstanceOf(NotFoundException);
  });
});
