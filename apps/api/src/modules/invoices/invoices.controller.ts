import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { InvoicesService } from './invoices.service';

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

@ApiTags('invoices')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user.organizationId, dto);
  }

  @Post('from-quote/:quoteId')
  createFromQuote(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId') quoteId: string,
    @Body() dto: CreateInvoiceFromQuoteDto,
  ) {
    return this.invoicesService.createFromQuote(user.organizationId, quoteId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.invoicesService.findAll(user.organizationId);
  }

  // Static routes must be declared before ':id' or they would be swallowed by it.
  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.invoicesService.summary(user.organizationId);
  }

  @Get('exchange-rate')
  exchangeRate(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !CURRENCY_CODE.test(from) || (to !== undefined && !CURRENCY_CODE.test(to))) {
      throw new BadRequestException('"from" (and optional "to") must be 3-letter currency codes.');
    }
    return this.invoicesService.lookupRate(user.organizationId, from, to);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoicesService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.invoicesService.updateStatus(user.organizationId, id, dto.status);
  }

  @Post(':id/payments')
  addPayment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.invoicesService.addPayment(user.organizationId, id, dto);
  }

  @Post(':id/payments/:paymentId/void')
  voidPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidPaymentDto,
  ) {
    return this.invoicesService.voidPayment(user.organizationId, id, paymentId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoicesService.remove(user.organizationId, id);
  }
}
