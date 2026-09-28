import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface InboxItem {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/** The dashboard bell: one row per user, so each person has their own read state. */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifies the organisation's users with one of `roles` (everyone if omitted). */
  async notifyOrganization(organizationId: string, item: InboxItem, roles?: UserRole[]) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, ...(roles && { role: { in: roles } }) },
      select: { id: true },
    });
    if (users.length === 0) return;
    await this.prisma.userNotification.createMany({
      data: users.map((u) => ({ userId: u.id, organizationId, ...item })),
    });
  }

  async notifyUser(userId: string, organizationId: string, item: InboxItem) {
    await this.prisma.userNotification.create({ data: { userId, organizationId, ...item } });
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.userNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.userNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (result.count === 0) {
      const exists = await this.prisma.userNotification.findFirst({ where: { id, userId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Notification not found.');
    }
    return this.list(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.userNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return this.list(userId);
  }
}
