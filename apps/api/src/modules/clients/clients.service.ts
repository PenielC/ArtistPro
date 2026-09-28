import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { organizationId, ...dto },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.client.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bookings: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { bookings: true } } },
    });
    if (!client) {
      throw new NotFoundException('Client not found.');
    }
    return client;
  }

  async update(organizationId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(organizationId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }
}
