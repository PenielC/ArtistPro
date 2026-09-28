import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const DRAFT_DOCUMENTS = ['INVOICE', 'QUOTE', 'CONTRACT', 'BOOKING'] as const;
export type DraftDocument = (typeof DRAFT_DOCUMENTS)[number];

export const CONTENT_TYPES = ['ARTIST_BIO', 'EPK_TAGLINE', 'PRESS_RELEASE', 'SOCIAL_POSTS'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export class DraftRequestDto {
  @IsIn(DRAFT_DOCUMENTS)
  document!: DraftDocument;

  @IsUUID()
  documentId!: string;

  /** e.g. "warmer tone", "mention the 50% deposit". */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class ContentRequestDto {
  @IsUUID()
  artistId!: string;

  @IsIn(CONTENT_TYPES)
  type!: ContentType;

  /** Required for a press release; optional for social posts. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class PricingRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  eventType!: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1440)
  durationMinutes?: number;

  @IsOptional()
  @IsUUID()
  artistId?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
