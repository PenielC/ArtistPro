import { Matches } from 'class-validator';

export class RescheduleBookingDto {
  /** The new event day, YYYY-MM-DD. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'eventDate must be a date in YYYY-MM-DD format' })
  eventDate!: string;
}
