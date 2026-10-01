import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ORGANIZATION_SUSPENDED } from '../../platform/suspension';
import type { JwtPayload } from '../auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const payload: JwtPayload = { sub: 'user-1', email: 'jane@example.com', organizationId: 'org-1', role: 'OWNER' };
  let findUnique: jest.Mock;
  let strategy: JwtStrategy;

  beforeEach(() => {
    findUnique = jest.fn();
    strategy = new JwtStrategy(
      { get: () => 'test-secret' } as unknown as ConfigService,
      { user: { findUnique } } as unknown as PrismaService,
    );
  });

  it('passes the payload through for a member of an active business', async () => {
    findUnique.mockResolvedValue({ organization: { suspendedAt: null } });

    await expect(strategy.validate(payload)).resolves.toEqual(payload);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { organization: { select: { suspendedAt: true } } },
    });
  });

  it('stops honouring tokens the moment the business is suspended', async () => {
    findUnique.mockResolvedValue({ organization: { suspendedAt: new Date() } });

    const error = await strategy.validate(payload).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: ORGANIZATION_SUSPENDED });
  });

  it('rejects tokens of users that no longer exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
