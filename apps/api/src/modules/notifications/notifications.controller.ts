import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ComposeQueryDto, EmailListQueryDto, ReminderSettingsDto, SendDocumentEmailDto } from './dto/notifications.dto';
import { EmailService } from './email.service';
import { InboxService } from './inbox.service';
import { RemindersService } from './reminders.service';

@ApiTags('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly emails: EmailService,
    private readonly inbox: InboxService,
    private readonly reminders: RemindersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('emails/compose')
  compose(@CurrentUser() user: JwtPayload, @Query() q: ComposeQueryDto) {
    return this.emails.composeDefaults(user.organizationId, q.kind, q.documentId);
  }

  @Post('emails')
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendDocumentEmailDto) {
    return this.emails.sendDocument(user.organizationId, user.sub, dto);
  }

  @Get('emails')
  list(@CurrentUser() user: JwtPayload, @Query() q: EmailListQueryDto) {
    return this.emails.list(user.organizationId, q);
  }

  @Post('emails/:id/retry')
  retry(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.emails.retry(user.organizationId, id);
  }

  @Get('settings')
  settings(@CurrentUser() user: JwtPayload) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { reminderEnabled: true, reminderDays: true },
    });
  }

  @Roles(UserRole.OWNER, UserRole.FINANCE)
  @Put('settings')
  saveSettings(@CurrentUser() user: JwtPayload, @Body() dto: ReminderSettingsDto) {
    return this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { reminderEnabled: dto.reminderEnabled, reminderDays: [...dto.reminderDays].sort((a, b) => a - b) },
      select: { reminderEnabled: true, reminderDays: true },
    });
  }

  /** Runs this organisation's overdue reminders now (the schedule also runs them daily). */
  @Roles(UserRole.OWNER, UserRole.FINANCE)
  @Post('reminders/run')
  runReminders(@CurrentUser() user: JwtPayload) {
    return this.reminders.runForOrganization(user.organizationId);
  }

  @Get('inbox')
  inboxList(@CurrentUser() user: JwtPayload) {
    return this.inbox.list(user.sub);
  }

  @Post('inbox/read-all')
  readAll(@CurrentUser() user: JwtPayload) {
    return this.inbox.markAllRead(user.sub);
  }

  @Post('inbox/:id/read')
  read(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inbox.markRead(user.sub, id);
  }
}
