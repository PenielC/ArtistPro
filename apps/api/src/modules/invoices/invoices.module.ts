import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, ExchangeRateService],
})
export class InvoicesModule {}
