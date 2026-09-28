import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsModule } from '../payments/payments.module';
import { EmailService } from './email.service';
import { InboxService } from './inbox.service';
import { Mailer } from './mailer';
import { NotificationWorker } from './notification.worker';
import { NotificationsController } from './notifications.controller';
import { PaymentEventsListener } from './payment-events.listener';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PaymentsModule],
  controllers: [NotificationsController],
  providers: [
    EmailService,
    InboxService,
    RemindersService,
    PaymentEventsListener,
    NotificationWorker,
    { provide: Mailer, inject: [ConfigService], useFactory: (config: ConfigService) => new Mailer(config) },
  ],
})
export class NotificationsModule {}
