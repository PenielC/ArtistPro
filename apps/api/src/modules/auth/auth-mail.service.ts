import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { renderHtml } from '../notifications/email-templates';
import { Mailer, type OutgoingMail } from '../notifications/mailer';
import { redisConnection } from '../notifications/notification.worker';
import { ROLE_LABELS } from './tokens';

const AUTH_EMAIL_QUEUE = 'auth-email';

/**
 * Account emails (password reset, email verification, team invitations). Kept apart from the business's
 * email history on purpose: these carry single-use links that nobody else in the business should see.
 * Jobs are retried a few times and deleted once sent, so links don't linger in Redis.
 */
@Injectable()
export class AuthMailService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuthMailService.name);
  private readonly mailer: Mailer;
  private readonly webBaseUrl: string;
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly config: ConfigService) {
    this.mailer = new Mailer(config);
    this.webBaseUrl = (
      config.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  onApplicationBootstrap() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn(
        'REDIS_URL is not set: account emails are sent directly, without retries.',
      );
      return;
    }
    const connection = redisConnection(url);
    this.queue = new Queue(AUTH_EMAIL_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: Number(
            this.config.get<string>('EMAIL_RETRY_DELAY_MS') ?? 30_000,
          ),
        },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    });
    this.worker = new Worker(
      AUTH_EMAIL_QUEUE,
      async (job) => this.mailer.send(job.data as OutgoingMail),
      { connection },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        `Account email "${job?.data?.subject}" failed (attempt ${job?.attemptsMade}): ${err.message}`,
      ),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  link(path: string) {
    return `${this.webBaseUrl}${path}`;
  }

  async passwordReset(to: { email: string; firstName: string }, token: string) {
    const url = this.link(`/reset-password?token=${encodeURIComponent(token)}`);
    await this.send(
      to.email,
      'Reset your ArtBH password',
      [
        `Hi ${to.firstName},`,
        'Someone asked to reset the password for your ArtBH account. If it was you, use the button below within the next hour.',
        `If the button doesn't work, open this link:\n${url}`,
        "If you didn't ask for this, you can ignore this email. Your password won't change.",
      ],
      url,
      'Reset password',
    );
  }

  async verifyEmail(to: { email: string; firstName: string }, token: string) {
    const url = this.link(`/verify-email?token=${encodeURIComponent(token)}`);
    await this.send(
      to.email,
      'Confirm your email for ArtBH',
      [
        `Hi ${to.firstName},`,
        'Please confirm this is your email address. Once it is, you can send quotes, invoices, contracts and payment links to your clients from ArtBH.',
        `If the button doesn't work, open this link (it works for 3 days):\n${url}`,
      ],
      url,
      'Confirm my email',
    );
  }

  async invitation(
    to: string,
    token: string,
    details: {
      inviterName: string;
      organizationName: string;
      role: keyof typeof ROLE_LABELS;
    },
  ) {
    const url = this.link(`/accept-invite?token=${encodeURIComponent(token)}`);
    await this.send(
      to,
      `${details.inviterName} invited you to ${details.organizationName} on ArtBH`,
      [
        'Hi,',
        `${details.inviterName} has invited you to join ${details.organizationName} on ArtBH as ${ROLE_LABELS[details.role]}.`,
        `Accept within 7 days to set up your account. If the button doesn't work, open this link:\n${url}`,
        "If you weren't expecting this, you can ignore this email.",
      ],
      url,
      'Accept invitation',
    );
  }

  private async send(
    to: string,
    subject: string,
    paragraphs: string[],
    ctaUrl: string,
    ctaLabel: string,
  ) {
    const bodyText = paragraphs.join('\n\n');
    const mail: OutgoingMail = {
      fromName: 'ArtBH',
      to,
      subject,
      text: bodyText,
      html: renderHtml(
        { bodyText, ctaUrl, ctaLabel },
        'ArtBH',
        'ArtBH · Art Business Hub',
      ),
    };
    if (this.queue) {
      await this.queue.add('send', mail);
      return;
    }
    // No Redis (tests, minimal setups): send now, and never let a mail failure break the request.
    await this.mailer
      .send(mail)
      .catch((err: Error) =>
        this.logger.warn(`Account email "${subject}" failed: ${err.message}`),
      );
  }
}
