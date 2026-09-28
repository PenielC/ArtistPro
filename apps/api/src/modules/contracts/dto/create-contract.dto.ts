import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContractDto {
  /** Omit to use the built-in standard template. */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  artistId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** Defaults to the organisation's name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  artistName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName!: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code in upper case' })
  currency?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  accommodation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  transport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  extraTerms?: string;
}
