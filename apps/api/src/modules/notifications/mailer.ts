import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface OutgoingMail {
  fromName: string;
  to: string;
  toName?: string | null;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
}

/** Sends over SMTP: any provider in production, Mailpit locally. */
export class Mailer {
  private readonly transport: Transporter;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.transport = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(config.get<string>('SMTP_PORT') ?? 1027),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASS') ?? '' } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    this.fromAddress = config.get<string>('EMAIL_FROM_ADDRESS') ?? 'notifications@artbh.local';
  }

  /** Returns the provider's message id. Throws on any SMTP failure so the job is retried. */
  async send(mail: OutgoingMail): Promise<string> {
    const info = await this.transport.sendMail({
      from: { name: mail.fromName, address: this.fromAddress },
      to: mail.toName ? { name: mail.toName, address: mail.to } : mail.to,
      replyTo: mail.replyTo ?? undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return info.messageId;
  }
}
