import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ORGANIZATION_SUSPENDED } from '../../platform/suspension';
import type { JwtPayload } from '../auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'jane@example.com',
    organizationId: 'org-1',
    role: 'OWNER',
  };
  let findUnique: jest.Mock;
  let strategy: JwtStrategy;

  const row = (over: Record<string, unknown> = {}) => ({
    email: 'jane@example.com',
    role: 'OWNER',
    organizationId: 'org-1',
    emailVerifiedAt: new Date(),
    removedAt: null,
    organization: { suspendedAt: null },
    ...over,
  });

  beforeEach(() => {
    findUnique = jest.fn();
    strategy = new JwtStrategy(
      { get: () => 'test-secret' } as unknown as ConfigService,
      { user: { findUnique } } as unknown as PrismaService,
    );
  });

  it('returns the member as the database has them now, with verification', async () => {
    findUnique.mockResolvedValue(row());

    await expect(strategy.validate(payload)).resolves.toEqual({
      ...payload,
      emailVerified: true,
    });
  });

  it('uses the current role, not the one in the token, so a role change applies at once', async () => {
    findUnique.mockResolvedValue(row({ role: 'STAFF', emailVerifiedAt: null }));

    await expect(strategy.validate(payload)).resolves.toMatchObject({
      role: 'STAFF',
      emailVerified: false,
    });
  });

  it('stops honouring tokens the moment the business is suspended', async () => {
    findUnique.mockResolvedValue(
      row({ organization: { suspendedAt: new Date() } }),
    );

    const error = await strategy.validate(payload).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      code: ORGANIZATION_SUSPENDED,
    });
  });

  it('rejects removed members at once', async () => {
    findUnique.mockResolvedValue(row({ removedAt: new Date() }));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects tokens of users that no longer exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
