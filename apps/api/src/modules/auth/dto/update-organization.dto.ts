import { Matches } from 'class-validator';

export class UpdateOrganizationDto {
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code in upper case' })
  currency!: string;
}
