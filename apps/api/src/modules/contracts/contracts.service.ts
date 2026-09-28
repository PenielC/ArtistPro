import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Contract, ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_CONTRACT_TEMPLATE, renderContract } from './contract-renderer';
import { CreateContractDto } from './dto/create-contract.dto';

const MAX_NUMBER_ATTEMPTS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

// DRAFT -> SENT -> SIGNED, with CANCELLED reachable from anywhere but final.
// A signed agreement can only be cancelled, never quietly reverted to a draft.
const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['DRAFT', 'SIGNED', 'CANCELLED'],
  SIGNED: ['CANCELLED'],
  CANCELLED: [],
};

export function toContractView(contract: Contract) {
  const fee = Number(contract.fee);
  const depositAmount = Number(contract.depositAmount);
  return { ...contract, fee, depositAmount, balanceAmount: round2(fee - depositAmount) };
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateContractDto) {
    let artist: { name: string } | null = null;
    if (dto.artistId) {
      artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId }, select: { name: true } });
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
    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({ where: { id: dto.quoteId, organizationId } });
      if (!quote) throw new NotFoundException('Quote not found.');
    }

    let templateBody = DEFAULT_CONTRACT_TEMPLATE.body;
    if (dto.templateId) {
      const template = await this.prisma.contractTemplate.findFirst({ where: { id: dto.templateId, organizationId } });
      if (!template) throw new NotFoundException('Template not found.');
      templateBody = template.body;
    }

    const depositAmount = dto.depositAmount ?? 0;
    if (depositAmount > dto.fee) {
      throw new BadRequestException('The deposit cannot be more than the total fee.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const artistName = dto.artistName ?? artist?.name ?? organization?.name ?? 'The Artist';
    const currency = dto.currency ?? 'USD';
    const eventDate = dto.eventDate ? new Date(dto.eventDate) : undefined;

    // The agreed text is frozen now: later edits to the template must not change a contract already issued.
    const body = renderContract(templateBody, {
      artistName,
      clientName: dto.clientName,
      title: dto.title,
      eventType: dto.eventType,
      eventDate,
      venue: dto.venue,
      durationMinutes: dto.durationMinutes,
      currency,
      fee: dto.fee,
      depositAmount,
      paymentTerms: dto.paymentTerms,
      cancellationTerms: dto.cancellationTerms,
      accommodation: dto.accommodation,
      transport: dto.transport,
      extraTerms: dto.extraTerms,
      today: new Date(),
    });

    // Per-organisation numbers (CON-0001 …); retry if a concurrent create took the same one.
    for (let attempt = 1; ; attempt++) {
      const last = await this.prisma.contract.findFirst({
        where: { organizationId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      try {
        const contract = await this.prisma.contract.create({
          data: {
            organizationId,
            number,
            artistId: dto.artistId,
            clientId: dto.clientId,
            bookingId: dto.bookingId,
            quoteId: dto.quoteId,
            templateId: dto.templateId,
            title: dto.title,
            artistName,
            clientName: dto.clientName,
            clientEmail: dto.clientEmail,
            eventType: dto.eventType,
            eventDate,
            venue: dto.venue,
            durationMinutes: dto.durationMinutes,
            currency,
            fee: dto.fee,
            depositAmount,
            cancellationTerms: dto.cancellationTerms,
            accommodation: dto.accommodation,
            transport: dto.transport,
            paymentTerms: dto.paymentTerms,
            extraTerms: dto.extraTerms,
            body,
          },
        });
        return toContractView(contract);
      } catch (err) {
        const isNumberCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isNumberCollision || attempt >= MAX_NUMBER_ATTEMPTS) throw err;
      }
    }
  }

  async findAll(organizationId: string) {
    const contracts = await this.prisma.contract.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return contracts.map(toContractView);
  }

  async findOne(organizationId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id, organizationId } });
    if (!contract) throw new NotFoundException('Contract not found.');
    return toContractView(contract);
  }

  async updateStatus(organizationId: string, id: string, status: ContractStatus, signedAt?: string) {
    const contract = await this.findOne(organizationId, id);
    if (!ALLOWED_TRANSITIONS[contract.status].includes(status)) {
      throw new BadRequestException(`A ${contract.status.toLowerCase()} contract cannot be changed to ${status.toLowerCase()}.`);
    }

    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status, ...(status === 'SIGNED' ? { signedAt: signedAt ? new Date(signedAt) : new Date() } : {}) },
    });
    return toContractView(updated);
  }

  async remove(organizationId: string, id: string) {
    const contract = await this.findOne(organizationId, id);
    if (contract.status !== 'DRAFT') {
      throw new BadRequestException('Only draft contracts can be deleted. Cancel the contract instead.');
    }
    await this.prisma.contract.delete({ where: { id } });
    return { deleted: true };
  }
}
