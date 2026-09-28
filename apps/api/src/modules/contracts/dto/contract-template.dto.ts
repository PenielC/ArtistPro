import { PartialType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContractTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}

export class UpdateContractTemplateDto extends PartialType(CreateContractTemplateDto) {}
