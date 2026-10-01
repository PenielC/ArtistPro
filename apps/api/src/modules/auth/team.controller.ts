import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import {
  ChangeRoleDto,
  InviteMemberDto,
  TransferOwnershipDto,
} from './dto/team.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { VerifiedEmailGuard } from './guards/verified-email.guard';
import { TeamService } from './team.service';

@ApiTags('team')
@Controller('team')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** Everyone sees the members; Owners and Managers also see pending invitations. */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.team.list(user);
  }

  @Post('invitations')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @UseGuards(VerifiedEmailGuard)
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteMemberDto) {
    return this.team.invite(user, dto);
  }

  @Post('invitations/:id/resend')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @UseGuards(VerifiedEmailGuard)
  resend(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.resend(user, id);
  }

  @Delete('invitations/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.cancel(user, id);
  }

  @Patch('members/:id/role')
  @Roles(UserRole.OWNER)
  changeRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.team.changeRole(user, id, dto);
  }

  @Delete('members/:id')
  @Roles(UserRole.OWNER)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.remove(user, id);
  }

  @Post('transfer-ownership')
  @HttpCode(200)
  @Roles(UserRole.OWNER)
  transfer(@CurrentUser() user: JwtPayload, @Body() dto: TransferOwnershipDto) {
    return this.team.transferOwnership(user, dto);
  }
}
