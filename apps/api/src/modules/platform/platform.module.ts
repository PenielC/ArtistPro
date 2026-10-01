import { Global, Module } from '@nestjs/common';
import { PlatformAdmins } from './platform-admins';
import { PlatformConfigService } from './platform-config.service';
import { PublicPlatformController } from './public-platform.controller';

/** Platform-wide settings and the admin allowlist, used by Auth (sign-ups, defaults) and Admin. */
@Global()
@Module({
  controllers: [PublicPlatformController],
  providers: [PlatformAdmins, PlatformConfigService],
  exports: [PlatformAdmins, PlatformConfigService],
})
export class PlatformModule {}
