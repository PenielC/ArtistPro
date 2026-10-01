import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { SavePaymentAccountDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: JwtPayload) {
    return this.paymentsService.listAccounts(user.organizationId);
  }

  /** Merchant credentials decide where client money goes, so only owners and finance can change them. */
  @Roles(UserRole.OWNER, UserRole.FINANCE)
  @Put('accounts')
  saveAccount(@CurrentUser() user: JwtPayload, @Body() dto: SavePaymentAccountDto) {
    return this.paymentsService.saveAccount(user.organizationId, dto);
  }

  @Roles(UserRole.OWNER, UserRole.FINANCE)
  @Delete('accounts/:id')
  removeAccount(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.paymentsService.removeAccount(user.organizationId, id);
  }

  @Get('attempts')
  listAttempts(@CurrentUser() user: JwtPayload) {
    return this.paymentsService.listAttempts(user.organizationId);
  }

  @Get('invoices/:invoiceId')
  invoiceInfo(@CurrentUser() user: JwtPayload, @Param('invoiceId') invoiceId: string) {
    return this.paymentsService.invoicePaymentInfo(user.organizationId, invoiceId);
  }

  @Post('invoices/:invoiceId/link')
  @UseGuards(VerifiedEmailGuard)
  enableLink(@CurrentUser() user: JwtPayload, @Param('invoiceId') invoiceId: string) {
    return this.paymentsService.enableLink(user.organizationId, invoiceId);
  }

  @Delete('invoices/:invoiceId/link')
  disableLink(@CurrentUser() user: JwtPayload, @Param('invoiceId') invoiceId: string) {
    return this.paymentsService.disableLink(user.organizationId, invoiceId);
  }
}
