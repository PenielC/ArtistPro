import { createHash, randomBytes } from 'crypto';

/** A link token: 32 random bytes, URL-safe. Only its hash is ever stored. */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashLinkToken(token) };
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_VERIFICATION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** At most this many reset emails per account per hour, so the form can't be used to flood an inbox. */
export const MAX_RESETS_PER_HOUR = 3;
/** Minimum gap between verification emails for one account. */
export const VERIFICATION_RESEND_GAP_MS = 60 * 1000;

export const ROLE_LABELS = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  FINANCE: 'Finance',
} as const;

/** Error codes the web app reacts to. */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';
