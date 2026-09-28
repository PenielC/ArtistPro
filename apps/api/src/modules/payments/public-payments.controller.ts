import { Body, Controller, Get, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StartPaymentDto, TestCheckoutDto } from './dto/payments.dto';
import { parseForm, type Pairs } from './gateways/paynow.gateway';
import { PaymentsService } from './payments.service';

/** Unauthenticated endpoints: the client's /pay/:token page, and provider callbacks. */
@ApiTags('public')
@Controller('public')
export class PublicPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('invoices/:token')
  invoice(@Param('token') token: string) {
    return this.paymentsService.publicInvoice(token);
  }

  @Post('invoices/:token/pay')
  pay(@Param('token') token: string, @Body() dto: StartPaymentDto) {
    return this.paymentsService.startPayment(token, dto);
  }

  @Get('invoices/:token/attempts/:attemptId')
  attempt(@Param('token') token: string, @Param('attemptId') attemptId: string) {
    return this.paymentsService.publicAttemptStatus(token, attemptId);
  }

  /**
   * Paynow's result URL. The hash covers field values in wire order, so the raw
   * body is parsed rather than the framework's object. Always answers 200: Paynow
   * doesn't expect a reply, and rejected messages are logged, never acted on.
   */
  @Post('payments/paynow/result/:attemptId')
  @HttpCode(200)
  async paynowResult(@Param('attemptId') attemptId: string, @Req() req: RawBodyRequest<Request>) {
    const pairs: Pairs = req.rawBody
      ? parseForm(req.rawBody.toString('utf8'))
      : Object.entries((req.body ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]);
    await this.paymentsService.handlePaynowResult(attemptId, pairs);
    return 'OK';
  }

  @Get('payments/test/:attemptId')
  testCheckout(@Param('attemptId') attemptId: string) {
    return this.paymentsService.testCheckoutInfo(attemptId);
  }

  @Post('payments/test/:attemptId')
  @HttpCode(200)
  testComplete(@Param('attemptId') attemptId: string, @Body() dto: TestCheckoutDto) {
    return this.paymentsService.testCheckoutComplete(attemptId, dto.outcome);
  }
}
