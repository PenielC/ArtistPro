import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EpkService } from './epk.service';

/** Unauthenticated: the press kit behind /a/:slug/epk. Published kits only, public artist fields only. */
@ApiTags('public')
@Controller('public/artists/:slug/epk')
export class PublicEpkController {
  constructor(private readonly epkService: EpkService) {}

  @Get()
  findOne(@Param('slug') slug: string) {
    return this.epkService.findPublic(slug);
  }
}
