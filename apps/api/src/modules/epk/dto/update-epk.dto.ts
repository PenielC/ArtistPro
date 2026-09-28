import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HTTP_URL_OPTIONS, urlMessage } from '../../../common/validation';

export class DiscographyItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  /** Album, EP, Single, Mixtape … free text. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsUrl(HTTP_URL_OPTIONS, { message: urlMessage('discography link') })
  url?: string;
}

export class PerformanceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
}

export class PressQuoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  quote!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  source!: string;

  @IsOptional()
  @IsUrl(HTTP_URL_OPTIONS, { message: urlMessage('press link') })
  url?: string;
}

export class GalleryItemDto {
  @IsUrl(HTTP_URL_OPTIONS, { message: urlMessage('photo link') })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  caption?: string;
}

export class MediaItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsUrl(HTTP_URL_OPTIONS, { message: urlMessage('video / music link') })
  url!: string;
}

/** Omitted sections are left unchanged; a section that is sent replaces the stored list in full (order included). */
export class UpdateEpkDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  achievements?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DiscographyItemDto)
  discography?: DiscographyItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PerformanceItemDto)
  performances?: PerformanceItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PressQuoteDto)
  pressQuotes?: PressQuoteDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => GalleryItemDto)
  gallery?: GalleryItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
