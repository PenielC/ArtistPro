import { Module } from '@nestjs/common';
import { ArtistsController } from './artists.controller';
import { ArtistsService } from './artists.service';
import { PublicArtistsController } from './public-artists.controller';

@Module({
  controllers: [ArtistsController, PublicArtistsController],
  providers: [ArtistsService],
})
export class ArtistsModule {}
