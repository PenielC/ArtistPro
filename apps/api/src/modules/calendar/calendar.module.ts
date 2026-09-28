import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { PublicCalendarController } from './public-calendar.controller';

@Module({
  controllers: [CalendarController, PublicCalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
