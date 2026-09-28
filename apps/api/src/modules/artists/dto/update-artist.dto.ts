import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../artist-slug';
import { CreateArtistDto } from './create-artist.dto';

// Optional fields may be sent as null to clear them. These three are required
// columns, so they may be omitted but never nulled.
export class UpdateArtistDto extends PartialType(CreateArtistDto) {
  @ValidateIf((o: UpdateArtistDto) => o.name !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((o: UpdateArtistDto) => o.slug !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'slug may only contain lowercase letters, numbers and single hyphens' })
  slug?: string;

  @ValidateIf((o: UpdateArtistDto) => o.isPublished !== undefined)
  @IsBoolean()
  isPublished?: boolean;
}
