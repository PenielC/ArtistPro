import { Injectable } from '@nestjs/common';
import type { PlatformConfig } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const CONFIG_ID = 1;

@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** The single settings row, created with the schema defaults the first time it's needed. */
  async get(): Promise<PlatformConfig> {
    return (
      (await this.prisma.platformConfig.findUnique({ where: { id: CONFIG_ID } })) ??
      this.prisma.platformConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID }, update: {} })
    );
  }

  /** What anyone may see: whether sign-ups are open and the current announcement. */
  async publicView() {
    const config = await this.get();
    return {
      signupsEnabled: config.signupsEnabled,
      announcement: config.announcement
        ? { message: config.announcement, tone: config.announcementTone, updatedAt: config.updatedAt }
        : null,
    };
  }
}
