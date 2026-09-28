import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HTTP_URL_OPTIONS as URL_OPTIONS, urlMessage } from '../../../common/validation';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../artist-slug';

export class CreateArtistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'slug may only contain lowercase letters, numbers and single hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  genres?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('photoUrl') })
  photoUrl?: string;

  @IsOptional()
  @IsEmail()
  bookingEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bookingPhone?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('website') })
  website?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('instagram') })
  instagram?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('facebook') })
  facebook?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('tiktok') })
  tiktok?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('youtube') })
  youtube?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: urlMessage('spotify') })
  spotify?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
