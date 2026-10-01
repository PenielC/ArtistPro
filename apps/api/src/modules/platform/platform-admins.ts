import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Who operates the platform. Deliberately an env allowlist (PLATFORM_ADMIN_EMAILS, comma-separated)
 * rather than a database flag: nothing inside the app can grant it, so it can't be escalated through
 * a bug or a compromised account. Separate from the per-business roles (OWNER, MANAGER…).
 */
@Injectable()
export class PlatformAdmins {
  private readonly emails: Set<string>;

  constructor(config: ConfigService) {
    this.emails = new Set(
      (config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isAdmin(email: string | null | undefined): boolean {
    return !!email && this.emails.has(email.trim().toLowerCase());
  }
}
