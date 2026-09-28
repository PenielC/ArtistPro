import { PaymentProvider } from '@prisma/client';
import { IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SavePaymentAccountDto {
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  /** Paynow issues one integration per currency. */
  @IsIn(['USD', 'ZWG'])
  currency!: string;

  /** Required for Paynow; ignored for the test provider. */
  @IsOptional()
  @Matches(/^\d{1,10}$/, { message: 'integrationId must be the numeric Integration ID from your Paynow dashboard' })
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  integrationKey?: string;
}

export class StartPaymentDto {
  /** Omit to pay the full outstanding balance. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class TestCheckoutDto {
  @IsIn(['paid', 'cancelled'])
  outcome!: 'paid' | 'cancelled';
}
