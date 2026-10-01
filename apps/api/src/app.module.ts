import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ArtistsModule } from './modules/artists/artists.module';
import { ClientsModule } from './modules/clients/clients.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { EpkModule } from './modules/epk/epk.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AiModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlatformModule } from './modules/platform/platform.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Domain events between modules (e.g. payment.received → notifications).
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    PlatformModule,
    HealthModule,
    AuthModule,
    ArtistsModule,
    ClientsModule,
    BookingsModule,
    CalendarModule,
    QuotesModule,
    ContractsModule,
    EpkModule,
    InvoicesModule,
    PaymentsModule,
    AiModule,
    NotificationsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
