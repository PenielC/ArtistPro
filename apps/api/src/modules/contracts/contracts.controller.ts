import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractsService } from './contracts.service';
import { CreateContractTemplateDto, UpdateContractTemplateDto } from './dto/contract-template.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';

// Template routes are declared before ':id' routes so "templates" is never
// mistaken for a contract id.
@ApiTags('contracts')
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly templatesService: ContractTemplatesService,
  ) {}

  @Get('templates/default')
  getDefaultTemplate() {
    return this.templatesService.getDefault();
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: JwtPayload) {
    return this.templatesService.findAll(user.organizationId);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateContractTemplateDto) {
    return this.templatesService.create(user.organizationId, dto);
  }

  @Patch('templates/:id')
  updateTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateContractTemplateDto) {
    return this.templatesService.update(user.organizationId, id, dto);
  }

  @Delete('templates/:id')
  removeTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.templatesService.remove(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateContractDto) {
    return this.contractsService.create(user.organizationId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.contractsService.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.contractsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateContractStatusDto) {
    return this.contractsService.updateStatus(user.organizationId, id, dto.status, dto.signedAt);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.contractsService.remove(user.organizationId, id);
  }
}
