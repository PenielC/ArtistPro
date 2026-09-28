import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DOCUMENT_KINDS = ['INVOICE', 'QUOTE', 'CONTRACT'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export class ComposeQueryDto {
  @IsIn(DOCUMENT_KINDS)
  kind!: DocumentKind;

  @IsUUID()
  documentId!: string;
}

export class SendDocumentEmailDto extends ComposeQueryDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  /** The personal note above the document details. */
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  message?: string;
}

export class EmailListQueryDto {
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;
}

export class ReminderSettingsDto {
  @IsBoolean()
  reminderEnabled!: boolean;

  /** Days after the due date to send a reminder, e.g. [1, 7, 14]. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(365, { each: true })
  reminderDays!: number[];
}
