import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CalendarService } from './calendar.service';

/**
 * The iCal subscription feed. Calendar apps can't log in, so the long random
 * token in the URL is the credential; resetting it cuts off the old link.
 */
@ApiTags('public')
@Controller('public/calendar')
export class PublicCalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get(':file')
  async feed(@Param('file') file: string, @Res() res: Response) {
    const token = file.replace(/\.ics$/i, '');
    const body = /^[\w-]{20,}$/.test(token) ? await this.calendar.feed(token) : null;
    if (body === null) throw new NotFoundException('Calendar feed not found.');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="artbh.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(body);
  }
}
