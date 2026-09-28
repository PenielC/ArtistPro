import { Module } from '@nestjs/common';
import { EpkController } from './epk.controller';
import { EpkService } from './epk.service';
import { PublicEpkController } from './public-epk.controller';

@Module({
  controllers: [EpkController, PublicEpkController],
  providers: [EpkService],
})
export class EpkModule {}
