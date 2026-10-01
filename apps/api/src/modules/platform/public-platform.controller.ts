import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformConfigService } from './platform-config.service';

@ApiTags('public')
@Controller('public/platform')
export class PublicPlatformController {
  constructor(private readonly config: PlatformConfigService) {}

  @Get()
  get() {
    return this.config.publicView();
  }
}
