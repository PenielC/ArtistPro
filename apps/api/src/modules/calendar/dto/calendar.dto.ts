import { CalendarEntryKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { DAY_PATTERN } from '../days';

const DAY_MESSAGE = 'must be a date in YYYY-MM-DD format';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CalendarRangeDto {
  @Matches(DAY_PATTERN, { message: `from ${DAY_MESSAGE}` })
  from!: string;

  @Matches(DAY_PATTERN, { message: `to ${DAY_MESSAGE}` })
  to!: string;

  @IsOptional()
  @IsUUID()
  artistId?: string;
}

export class ConflictQueryDto {
  @Matches(DAY_PATTERN, { message: `date ${DAY_MESSAGE}` })
  date!: string;

  @IsOptional()
  @IsUUID()
  artistId?: string;

  /** The booking being edited, so it doesn't clash with itself. */
  @IsOptional()
  @IsUUID()
  excludeBookingId?: string;
}

export class MoveEntryDto {
  /** New first day; the entry keeps its length. */
  @Matches(DAY_PATTERN, { message: `startDate ${DAY_MESSAGE}` })
  startDate!: string;
}

export class MovePreviewDto {
  @IsUUID()
  bookingId!: string;

  @Matches(DAY_PATTERN, { message: `date ${DAY_MESSAGE}` })
  date!: string;
}

export class MoveItemDto {
  @IsIn(['ENTRY', 'BOOKING'])
  type!: 'ENTRY' | 'BOOKING';

  @IsUUID()
  id!: string;

  /** New day for a booking; new first day for an entry (it keeps its length). */
  @Matches(DAY_PATTERN, { message: `toDate ${DAY_MESSAGE}` })
  toDate!: string;
}

export class MovesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MoveItemDto)
  moves!: MoveItemDto[];
}

export class CalendarEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsEnum(CalendarEntryKind)
  kind!: CalendarEntryKind;

  @IsOptional()
  @IsUUID()
  artistId?: string | null;

  @Matches(DAY_PATTERN, { message: `startDate ${DAY_MESSAGE}` })
  startDate!: string;

  /** Inclusive; omit for a single day. */
  @IsOptional()
  @Matches(DAY_PATTERN, { message: `endDate ${DAY_MESSAGE}` })
  endDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM (24-hour)' })
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM (24-hour)' })
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
