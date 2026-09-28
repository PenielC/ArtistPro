import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { CalendarEntryDto, CalendarRangeDto, ConflictQueryDto, MoveEntryDto, MovePreviewDto, MovesDto } from './dto/calendar.dto';

@ApiTags('calendar')
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  items(@CurrentUser() user: JwtPayload, @Query() q: CalendarRangeDto) {
    return this.calendar.items(user.organizationId, q.from, q.to, q.artistId);
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: JwtPayload, @Query() q: ConflictQueryDto) {
    return this.calendar.conflictsOn(user.organizationId, q.date, q.artistId, q.excludeBookingId);
  }

  @Post('entries')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CalendarEntryDto) {
    return this.calendar.createEntry(user.organizationId, user.sub, dto);
  }

  @Patch('entries/:id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CalendarEntryDto) {
    return this.calendar.updateEntry(user.organizationId, id, dto);
  }

  @Post('entries/:id/move')
  move(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: MoveEntryDto) {
    return this.calendar.moveEntry(user.organizationId, id, dto.startDate);
  }

  @Get('move-preview')
  movePreview(@CurrentUser() user: JwtPayload, @Query() q: MovePreviewDto) {
    return this.calendar.movePreview(user.organizationId, q.bookingId, q.date);
  }

  /** What a group move would mean (clashes, documents keeping old dates), for the confirm step. */
  @Post('moves/preview')
  @HttpCode(200)
  previewMoves(@CurrentUser() user: JwtPayload, @Body() dto: MovesDto) {
    return this.calendar.previewMoves(user.organizationId, dto.moves);
  }

  /** Moves several items at once, all or nothing; returns the moves that undo it. */
  @Post('moves')
  @HttpCode(200)
  applyMoves(@CurrentUser() user: JwtPayload, @Body() dto: MovesDto) {
    return this.calendar.applyMoves(user.organizationId, dto.moves);
  }

  @Delete('entries/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.calendar.removeEntry(user.organizationId, id);
  }

  @Get('feed')
  feedLink(@CurrentUser() user: JwtPayload) {
    return this.calendar.feedLink(user.sub);
  }

  @Post('feed/reset')
  resetFeed(@CurrentUser() user: JwtPayload) {
    return this.calendar.resetFeed(user.sub);
  }
}
