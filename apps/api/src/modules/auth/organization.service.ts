import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCurrency(organizationId: string, currency: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, currency: true },
    });
    if (!organization) throw new NotFoundException('Organization not found.');
    if (organization.currency === currency) return organization;

    // Every invoice stores its exchange rate *to the base currency at the time*.
    // Changing the base afterwards would silently make those rates meaningless.
    const invoiceCount = await this.prisma.invoice.count({ where: { organizationId } });
    if (invoiceCount > 0) {
      throw new ConflictException(
        "The base currency can't be changed once invoices exist, because their exchange rates are recorded against it.",
      );
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { currency },
      select: { id: true, name: true, currency: true },
    });
  }
}
