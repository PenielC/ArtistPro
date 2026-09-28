import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EMAIL_QUEUED, EmailService, MAX_SEND_ATTEMPTS, type EmailQueuedEvent } from './email.service';
import { RemindersService } from './reminders.service';

const EMAIL_QUEUE = 'email';
const REMINDER_QUEUE = 'reminders';
const STALE_AFTER_MS = 60_000;

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers: a blocked command must wait for Redis, not give up.
    maxRetriesPerRequest: null,
  };
}

/**
 * Background delivery on BullMQ. The database row is the source of truth:
 * a job only carries the email id, uses it as the job id (so the same email
 * is never queued twice at once), and on startup anything still pending, for
 * example after a crash or while Redis was down, is queued again.
 */
@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private emailQueue?: Queue;
  private reminderQueue?: Queue;
  private workers: Worker[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
    private readonly reminders: RemindersService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL is not set: emails will be logged but not delivered.');
      return;
    }
    const connection = redisConnection(url);
    const retryDelay = Number(this.config.get<string>('EMAIL_RETRY_DELAY_MS') ?? 30_000);

    this.emailQueue = new Queue(EMAIL_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: MAX_SEND_ATTEMPTS,
        backoff: { type: 'exponential', delay: retryDelay },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    });
    this.reminderQueue = new Queue(REMINDER_QUEUE, { connection, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 50 } });

    this.workers.push(
      new Worker<EmailQueuedEvent>(
        EMAIL_QUEUE,
        async (job) => this.emails.deliver(job.data.emailId, job.attemptsMade + 1, job.opts.attempts ?? MAX_SEND_ATTEMPTS),
        { connection, concurrency: 5 },
      ),
      new Worker(REMINDER_QUEUE, async () => this.reminders.runForAll(new Date()), { connection, concurrency: 1 }),
    );
    for (const worker of this.workers) {
      worker.on('error', (err) => this.logger.error(`Worker error: ${err.message}`));
    }

    const pattern = this.config.get<string>('REMINDERS_CRON') ?? '0 8 * * *';
    const tz = this.config.get<string>('REMINDERS_TZ') ?? 'Africa/Harare';
    await this.reminderQueue.upsertJobScheduler('overdue-reminders', { pattern, tz }, { name: 'run' });
    this.logger.log(`Email worker started; overdue reminders scheduled "${pattern}" (${tz}).`);

    await this.requeueStale();
  }

  async onModuleDestroy() {
    await Promise.allSettled([...this.workers.map((w) => w.close()), this.emailQueue?.close(), this.reminderQueue?.close()]);
  }

  @OnEvent(EMAIL_QUEUED)
  async onEmailQueued({ emailId }: EmailQueuedEvent) {
    await this.enqueue(emailId);
  }

  private async enqueue(emailId: string) {
    if (!this.emailQueue) return;
    try {
      await this.emailQueue.add('send', { emailId }, { jobId: emailId });
    } catch (err) {
      // The row stays PENDING and is picked up again on the next startup.
      this.logger.error(`Could not queue email ${emailId}: ${(err as Error).message}`);
    }
  }

  private async requeueStale() {
    const stale = await this.prisma.emailMessage.findMany({
      where: { status: { in: ['PENDING', 'SENDING'] }, updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      select: { id: true },
      take: 1000,
    });
    for (const { id } of stale) await this.enqueue(id);
    if (stale.length) this.logger.warn(`Re-queued ${stale.length} email(s) left pending.`);
  }
}
