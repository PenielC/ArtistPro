import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaynowGateway } from './gateways/paynow.gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PublicPaymentsController } from './public-payments.controller';

@Module({
  controllers: [PaymentsController, PublicPaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PaynowGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new PaynowGateway(config.get<string>('PAYNOW_API_BASE') ?? 'https://www.paynow.co.zw'),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
