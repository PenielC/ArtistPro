import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { AdminService } from './admin.service';
import {
  AuditQueryDto,
  ListOrganizationsQueryDto,
  OverviewQueryDto,
  SuspendOrganizationDto,
  UpdateAiLimitDto,
  UpdatePlatformConfigDto,
} from './dto/admin.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

@ApiTags('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(@Query() q: OverviewQueryDto) {
    return this.admin.overview(q);
  }

  @Get('organizations')
  organizations(@Query() q: ListOrganizationsQueryDto) {
    return this.admin.organizations(q);
  }

  @Get('organizations/:id')
  organization(@Param('id') id: string) {
    return this.admin.organization(id);
  }

  @Post('organizations/:id/suspend')
  suspend(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SuspendOrganizationDto) {
    return this.admin.suspend(user, id, dto.reason);
  }

  @Post('organizations/:id/reactivate')
  reactivate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.reactivate(user, id);
  }

  @Patch('organizations/:id/ai-limit')
  setAiLimit(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateAiLimitDto) {
    return this.admin.setAiLimit(user, id, dto.aiMonthlyLimit);
  }

  @Get('config')
  config() {
    return this.admin.config();
  }

  @Patch('config')
  updateConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePlatformConfigDto) {
    return this.admin.updateConfig(user, dto);
  }

  @Get('audit')
  audit(@Query() q: AuditQueryDto) {
    return this.admin.audit(q);
  }
}
