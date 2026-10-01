import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: UserRole;
  /** Filled in per request from the database (not in the token), so it is always current. */
  emailVerified?: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId: string;
    organizationName: string;
    organizationCurrency: string;
    emailVerified: boolean;
    /** Display only (shows the Admin area); the admin API checks the allowlist itself. */
    isPlatformAdmin: boolean;
  };
}
