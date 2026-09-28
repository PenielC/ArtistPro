import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CONTRACT_PLACEHOLDERS, DEFAULT_CONTRACT_TEMPLATE, findUnknownPlaceholders } from './contract-renderer';
import { CreateContractTemplateDto, UpdateContractTemplateDto } from './dto/contract-template.dto';

function assertKnownPlaceholders(body: string) {
  const unknown = findUnknownPlaceholders(body);
  if (unknown.length > 0) {
    throw new BadRequestException(
      `Unknown placeholder${unknown.length === 1 ? '' : 's'}: ${unknown.map((k) => `{{${k}}}`).join(', ')}. ` +
        `Valid ones are: ${CONTRACT_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(', ')}.`,
    );
  }
}

@Injectable()
export class ContractTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  getDefault() {
    return { ...DEFAULT_CONTRACT_TEMPLATE, placeholders: CONTRACT_PLACEHOLDERS };
  }

  findAll(organizationId: string) {
    return this.prisma.contractTemplate.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  async create(organizationId: string, dto: CreateContractTemplateDto) {
    assertKnownPlaceholders(dto.body);
    try {
      return await this.prisma.contractTemplate.create({ data: { organizationId, name: dto.name.trim(), body: dto.body } });
    } catch (err) {
      throw this.translate(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateContractTemplateDto) {
    await this.findOne(organizationId, id);
    if (dto.body !== undefined) assertKnownPlaceholders(dto.body);
    try {
      return await this.prisma.contractTemplate.update({
        where: { id },
        data: { name: dto.name?.trim(), body: dto.body },
      });
    } catch (err) {
      throw this.translate(err);
    }
  }

  async findOne(organizationId: string, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id, organizationId } });
    if (!template) throw new NotFoundException('Template not found.');
    return template;
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    // Contracts already created keep their own copy of the text (templateId just becomes null).
    await this.prisma.contractTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  private translate(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('You already have a template with that name.');
    }
    return err;
  }
}
