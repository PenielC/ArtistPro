import { QuoteStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateQuoteStatusDto {
  @IsEnum(QuoteStatus)
  status!: QuoteStatus;
}
