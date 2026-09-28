import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractsService } from './contracts.service';

function contractRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'con-1',
    organizationId: 'org-1',
    number: 1,
    status: 'DRAFT',
    fee: '1200.00',
    depositAmount: '600.00',
    signedAt: null,
    body: 'text',
    ...overrides,
  };
}

function collision() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: {
    contract: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    contractTemplate: { findFirst: jest.Mock };
    artist: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
    quote: { findFirst: jest.Mock };
    organization: { findUnique: jest.Mock };
  };

  const baseDto = { title: 'Wedding gig', clientName: 'Tariro Events', fee: 1200 };

  beforeEach(() => {
    prisma = {
      contract: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      contractTemplate: { findFirst: jest.fn() },
      artist: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      quote: { findFirst: jest.fn() },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Kuda Live Band' }) },
    };
    service = new ContractsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects an artist from another organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, artistId: 'artist-x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'artist-x', organizationId: 'org-1' });
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('links the contract to an artist in the organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1', name: 'Tamy Moyo' });
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue(contractRow());

      await service.create('org-1', { ...baseDto, artistId: 'artist-1' });

      expect(prisma.contract.create.mock.calls[0][0].data.artistId).toBe('artist-1');
    });

    it('renders the built-in template into the stored body, defaulting the artist to the organisation name', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue(contractRow());

      await service.create('org-1', { ...baseDto, depositAmount: 600, venue: 'Meikles Hotel' });

      const data = prisma.contract.create.mock.calls[0][0].data;
      expect(data.artistName).toBe('Kuda Live Band');
      expect(data.body).toContain('PERFORMANCE AGREEMENT');
      expect(data.body).toContain('between Kuda Live Band ("the Artist") and Tariro Events ("the Client")');
      expect(data.body).toContain('Venue: Meikles Hotel');
      expect(data.body).toContain('total performance fee of $1,200.00');
      expect(data.body).not.toMatch(/\{\{/);
    });

    it('uses the organisation\'s own template when a templateId is given', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue({ id: 'tpl-1', body: 'Deal between {{artistName}} and {{clientName}} for {{fee}}.' });
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue(contractRow());

      await service.create('org-1', { ...baseDto, templateId: 'tpl-1' });

      const data = prisma.contract.create.mock.calls[0][0].data;
      expect(data.body).toBe('Deal between Kuda Live Band and Tariro Events for $1,200.00.');
      expect(data.templateId).toBe('tpl-1');
      expect(prisma.contractTemplate.findFirst.mock.calls[0][0].where).toEqual({ id: 'tpl-1', organizationId: 'org-1' });
    });

    it('rejects a template belonging to another organisation', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, templateId: 'someone-elses' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('rejects a client, booking or quote from another organisation', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      await expect(service.create('org-1', { ...baseDto, clientId: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.create('org-1', { ...baseDto, bookingId: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.create('org-1', { ...baseDto, quoteId: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('names the linked artist in the contract, unless an artist name is typed explicitly', async () => {
      prisma.artist.findFirst.mockResolvedValue({ name: 'Tamy Moyo' });
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue(contractRow());

      await service.create('org-1', { ...baseDto, artistId: 'artist-1' });
      await service.create('org-1', { ...baseDto, artistId: 'artist-1', artistName: 'Tamy Moyo & Band' });

      expect(prisma.contract.create.mock.calls[0][0].data.artistName).toBe('Tamy Moyo');
      expect(prisma.contract.create.mock.calls[0][0].data.body).toContain('between Tamy Moyo ("the Artist")');
      expect(prisma.contract.create.mock.calls[1][0].data.artistName).toBe('Tamy Moyo & Band');
    });

    it('rejects a deposit larger than the fee', async () => {
      await expect(service.create('org-1', { ...baseDto, depositAmount: 1500 })).rejects.toThrow(/deposit cannot be more/);
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('defaults the deposit to 0 and currency to USD, and returns the balance', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue(contractRow({ depositAmount: '0.00' }));

      const result = await service.create('org-1', baseDto);

      const data = prisma.contract.create.mock.calls[0][0].data;
      expect(data.depositAmount).toBe(0);
      expect(data.currency).toBe('USD');
      expect(result.balanceAmount).toBe(1200);
    });

    it('numbers per organisation, continuing after the highest existing number', async () => {
      prisma.contract.findFirst.mockResolvedValue({ number: 4 });
      prisma.contract.create.mockResolvedValue(contractRow({ number: 5 }));

      await service.create('org-1', baseDto);

      expect(prisma.contract.create.mock.calls[0][0].data.number).toBe(5);
    });

    it('retries with a fresh number after a concurrent collision, then gives up after 3 attempts', async () => {
      prisma.contract.findFirst.mockResolvedValue({ number: 1 });
      prisma.contract.create.mockRejectedValueOnce(collision()).mockResolvedValueOnce(contractRow({ number: 2 }));
      await service.create('org-1', baseDto);
      expect(prisma.contract.create).toHaveBeenCalledTimes(2);

      prisma.contract.create.mockReset();
      const err = collision();
      prisma.contract.create.mockRejectedValue(err);
      await expect(service.create('org-1', baseDto)).rejects.toBe(err);
      expect(prisma.contract.create).toHaveBeenCalledTimes(3);
    });

    it('does not swallow unrelated database errors', async () => {
      const boom = new Error('connection lost');
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockRejectedValue(boom);

      await expect(service.create('org-1', baseDto)).rejects.toBe(boom);
      expect(prisma.contract.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll / findOne', () => {
    it('scopes the list to the organisation and converts money to numbers', async () => {
      prisma.contract.findMany.mockResolvedValue([contractRow()]);

      const result = await service.findAll('org-1');

      expect(prisma.contract.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1' });
      expect(result[0].fee).toBe(1200);
      expect(result[0].balanceAmount).toBe(600);
    });

    it('throws NotFoundException for a contract in another organisation', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'con-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('does not change a contract it cannot confirm belongs to the organisation', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('org-1', 'con-1', 'SENT')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('allows the normal path DRAFT -> SENT -> SIGNED, stamping signedAt on signing', async () => {
      prisma.contract.findFirst.mockResolvedValueOnce(contractRow({ status: 'DRAFT' }));
      prisma.contract.update.mockResolvedValueOnce(contractRow({ status: 'SENT' }));
      await service.updateStatus('org-1', 'con-1', 'SENT');
      expect(prisma.contract.update.mock.calls[0][0].data).toEqual({ status: 'SENT' });

      prisma.contract.findFirst.mockResolvedValueOnce(contractRow({ status: 'SENT' }));
      prisma.contract.update.mockResolvedValueOnce(contractRow({ status: 'SIGNED' }));
      await service.updateStatus('org-1', 'con-1', 'SIGNED');
      const data = prisma.contract.update.mock.calls[1][0].data;
      expect(data.status).toBe('SIGNED');
      expect(data.signedAt).toBeInstanceOf(Date);
    });

    it('records an earlier signing date when one is supplied', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'SENT' }));
      prisma.contract.update.mockResolvedValue(contractRow({ status: 'SIGNED' }));

      await service.updateStatus('org-1', 'con-1', 'SIGNED', '2026-09-01');

      expect(prisma.contract.update.mock.calls[0][0].data.signedAt).toEqual(new Date('2026-09-01'));
    });

    it('cannot jump from DRAFT straight to SIGNED', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'DRAFT' }));

      await expect(service.updateStatus('org-1', 'con-1', 'SIGNED')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('lets a signed agreement be cancelled but never reverted to a draft or re-sent', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'SIGNED' }));
      await expect(service.updateStatus('org-1', 'con-1', 'DRAFT')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateStatus('org-1', 'con-1', 'SENT')).rejects.toBeInstanceOf(BadRequestException);

      prisma.contract.update.mockResolvedValue(contractRow({ status: 'CANCELLED' }));
      await service.updateStatus('org-1', 'con-1', 'CANCELLED');
      expect(prisma.contract.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' });
    });

    it('treats CANCELLED as final', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'CANCELLED' }));

      for (const target of ['DRAFT', 'SENT', 'SIGNED'] as const) {
        await expect(service.updateStatus('org-1', 'con-1', target)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('lets a sent contract be pulled back to a draft to fix a mistake', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'SENT' }));
      prisma.contract.update.mockResolvedValue(contractRow({ status: 'DRAFT' }));

      const result = await service.updateStatus('org-1', 'con-1', 'DRAFT');

      expect(result.status).toBe('DRAFT');
    });
  });

  describe('remove', () => {
    it('only deletes drafts', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow({ status: 'SENT' }));

      await expect(service.remove('org-1', 'con-1')).rejects.toThrow(/Cancel the contract instead/);
      expect(prisma.contract.delete).not.toHaveBeenCalled();
    });

    it('deletes a draft it can confirm belongs to the organisation', async () => {
      prisma.contract.findFirst.mockResolvedValue(contractRow());

      expect(await service.remove('org-1', 'con-1')).toEqual({ deleted: true });
      expect(prisma.contract.delete).toHaveBeenCalledWith({ where: { id: 'con-1' } });
    });
  });
});

describe('ContractTemplatesService', () => {
  let service: ContractTemplatesService;
  let prisma: {
    contractTemplate: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      contractTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ContractTemplatesService(prisma as unknown as PrismaService);
  });

  it('exposes the built-in template together with the placeholders it supports', () => {
    const result = service.getDefault();

    expect(result.name).toBe('Standard performance agreement');
    expect(result.body).toContain('{{fee}}');
    expect(result.placeholders.map((p) => p.key)).toContain('cancellationTerms');
  });

  it('creates a template scoped to the organisation with a trimmed name', async () => {
    prisma.contractTemplate.create.mockResolvedValue({ id: 'tpl-1' });

    await service.create('org-1', { name: '  Corporate gigs  ', body: 'Fee: {{fee}}' });

    expect(prisma.contractTemplate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', name: 'Corporate gigs', body: 'Fee: {{fee}}' },
    });
  });

  it('rejects a template with a mistyped placeholder and says which one', async () => {
    await expect(service.create('org-1', { name: 'Bad', body: 'Fee: {{fe}} for {{clientNme}}' })).rejects.toThrow(
      /Unknown placeholders: \{\{fe\}\}, \{\{clientNme\}\}/,
    );
    expect(prisma.contractTemplate.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate name into a friendly conflict', async () => {
    prisma.contractTemplate.create.mockRejectedValue(collisionError());

    await expect(service.create('org-1', { name: 'Dup', body: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates placeholders on update too, and refuses templates it cannot confirm are the organisation\'s', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue(null);
    await expect(service.update('org-1', 'tpl-1', { body: 'ok' })).rejects.toBeInstanceOf(NotFoundException);

    prisma.contractTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
    await expect(service.update('org-1', 'tpl-1', { body: '{{nope}}' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.contractTemplate.update).not.toHaveBeenCalled();
  });

  it('only deletes a template the organisation owns', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue(null);
    await expect(service.remove('org-1', 'tpl-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.contractTemplate.delete).not.toHaveBeenCalled();

    prisma.contractTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
    expect(await service.remove('org-1', 'tpl-1')).toEqual({ deleted: true });
  });
});

function collisionError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
