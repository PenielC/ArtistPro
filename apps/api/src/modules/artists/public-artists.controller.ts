import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtistsService } from './artists.service';

/** Unauthenticated: the shareable profile behind /a/:slug. Published profiles only, public fields only. */
@ApiTags('public')
@Controller('public/artists')
export class PublicArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.artistsService.findPublic(slug);
  }
}
