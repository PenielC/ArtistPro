import { ContractStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UpdateContractStatusDto {
  @IsEnum(ContractStatus)
  status!: ContractStatus;

  /** When it was actually signed, if that was earlier than today. Only used for SIGNED. */
  @IsOptional()
  @IsDateString()
  signedAt?: string;
}
