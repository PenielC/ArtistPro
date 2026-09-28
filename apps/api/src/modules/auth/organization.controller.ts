import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OrganizationService } from './organization.service';

@ApiTags('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Roles(UserRole.OWNER)
  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.updateCurrency(user.organizationId, dto.currency);
  }
}
