import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: UserRole;
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
  };
}
