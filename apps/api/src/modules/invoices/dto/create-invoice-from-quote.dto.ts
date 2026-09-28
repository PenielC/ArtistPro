import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateInvoiceFromQuoteDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  exchangeRate?: number;
}
