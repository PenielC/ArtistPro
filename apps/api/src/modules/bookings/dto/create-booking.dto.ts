import { IsDateString, IsEmail, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsOptional()
  @IsUUID()
  artistId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  @MinLength(1)
  clientName!: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsNumber()
  fee?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
