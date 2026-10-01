import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdmins } from '../platform/platform-admins';
import { PlatformConfigService } from '../platform/platform-config.service';
import { ORGANIZATION_SUSPENDED, SIGNUPS_PAUSED } from '../platform/suspension';

const REGISTER = {
  organizationName: 'Acme Artists',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  password: 'Password123!',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    organization: { create: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let platformConfig: { get: jest.Mock };
  let adminEmails: string;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      organization: { create: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-access-token') };
    configService = { get: jest.fn().mockReturnValue(undefined) };
    platformConfig = { get: jest.fn().mockResolvedValue({ signupsEnabled: true, defaultAiMonthlyLimit: 100 }) };
    adminEmails = 'ops@artbh.local, Boss@ArtBH.local';

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      platformConfig as unknown as PlatformConfigService,
      new PlatformAdmins({ get: () => adminEmails } as unknown as ConfigService),
    );
  });

  const member = async (org: Record<string, unknown> = {}, email = 'jane@example.com') => ({
    id: 'user-1',
    email,
    passwordHash: await bcrypt.hash('correct-password', 10),
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'OWNER',
    organizationId: 'org-1',
    organization: { name: 'Acme Artists', currency: 'ZAR', suspendedAt: null, ...org },
  });

  describe('register', () => {
    it('creates an organization and an OWNER user, and returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Artists', currency: 'USD' });
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
      });

      const result = await service.register(REGISTER);

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user.role).toBe('OWNER');
      expect(result.user.organizationId).toBe('org-1');
      expect(result.user.organizationCurrency).toBe('USD');
      expect(result.user.isPlatformAdmin).toBe(false);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("gives new businesses the platform's current default AI limit", async () => {
      platformConfig.get.mockResolvedValue({ signupsEnabled: true, defaultAiMonthlyLimit: 25 });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Artists', currency: 'USD' });
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', role: 'OWNER' });

      await service.register(REGISTER);

      expect(prisma.organization.create).toHaveBeenCalledWith({ data: { name: 'Acme Artists', aiMonthlyLimit: 25 } });
    });

    it('refuses sign-ups while they are paused, before touching anything', async () => {
      platformConfig.get.mockResolvedValue({ signupsEnabled: false, defaultAiMonthlyLimit: 100 });

      const error = await service.register(REGISTER).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: SIGNUPS_PAUSED });
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(REGISTER)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@example.com', password: 'whatever' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(await member());

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(await member());

      const result = await service.login({ email: 'jane@example.com', password: 'correct-password' });

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user.organizationName).toBe('Acme Artists');
      expect(result.user.organizationCurrency).toBe('ZAR');
    });

    it('refuses a suspended business with a clear code, and issues no session', async () => {
      prisma.user.findUnique.mockResolvedValue(await member({ suspendedAt: new Date() }));

      const error = await service.login({ email: 'jane@example.com', password: 'correct-password' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: ORGANIZATION_SUSPENDED });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("doesn't reveal a suspension to someone with the wrong password", async () => {
      prisma.user.findUnique.mockResolvedValue(await member({ suspendedAt: new Date() }));

      await expect(service.login({ email: 'jane@example.com', password: 'wrong-password' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('flags platform admins from the allowlist, ignoring case and spaces', async () => {
      prisma.user.findUnique.mockResolvedValue(await member({}, 'boss@artbh.local'));

      const result = await service.login({ email: 'boss@artbh.local', password: 'correct-password' });

      expect(result.user.isPlatformAdmin).toBe(true);
    });
  });

  describe('refresh', () => {
    const token = (org: Record<string, unknown> = {}) => ({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
        organizationId: 'org-1',
        organization: { name: 'Acme Artists', currency: 'USD', suspendedAt: null, ...org },
      },
    });

    it('rotates the refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(token());

      const result = await service.refresh('old');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'rt-1' }, data: { revokedAt: expect.any(Date) } });
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('refuses a suspended business and burns the token it was given', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(token({ suspendedAt: new Date() }));

      const error = await service.refresh('old').catch((e: unknown) => e);

      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: ORGANIZATION_SUSPENDED });
      expect(prisma.refreshToken.update).toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
