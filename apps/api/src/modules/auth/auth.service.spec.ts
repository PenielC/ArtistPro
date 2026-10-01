import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthMailService } from './auth-mail.service';
import { hashLinkToken } from './tokens';
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
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    authToken: {
      create: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    invitation: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
    organization: { create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let mail: { passwordReset: jest.Mock; verifyEmail: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let platformConfig: { get: jest.Mock };
  let adminEmails: string;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      authToken: {
        create: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      invitation: { findUnique: jest.fn(), update: jest.fn() },
      // Array form: the operations ran when built; callback form: run it against the same mocks.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as unknown[]),
      ),
      organization: { create: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    mail = {
      passwordReset: jest.fn().mockResolvedValue(undefined),
      verifyEmail: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-access-token') };
    configService = { get: jest.fn().mockReturnValue(undefined) };
    platformConfig = {
      get: jest.fn().mockResolvedValue({
        signupsEnabled: true,
        defaultAiMonthlyLimit: 100,
      }),
    };
    adminEmails = 'ops@artbh.local, Boss@ArtBH.local';

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      platformConfig as unknown as PlatformConfigService,
      new PlatformAdmins({
        get: () => adminEmails,
      } as unknown as ConfigService),
      mail as unknown as AuthMailService,
    );
  });

  const member = async (
    org: Record<string, unknown> = {},
    email = 'jane@example.com',
  ) => ({
    id: 'user-1',
    email,
    passwordHash: await bcrypt.hash('correct-password', 10),
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'OWNER',
    organizationId: 'org-1',
    emailVerifiedAt: null,
    removedAt: null,
    organization: {
      id: 'org-1',
      name: 'Acme Artists',
      currency: 'ZAR',
      suspendedAt: null,
      ...org,
    },
  });

  describe('register', () => {
    it('creates an organization and an OWNER user, and returns tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Artists',
        currency: 'USD',
      });
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
      platformConfig.get.mockResolvedValue({
        signupsEnabled: true,
        defaultAiMonthlyLimit: 25,
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Artists',
        currency: 'USD',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
      });

      await service.register(REGISTER);

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme Artists', aiMonthlyLimit: 25 },
      });
    });

    it('refuses sign-ups while they are paused, before touching anything', async () => {
      platformConfig.get.mockResolvedValue({
        signupsEnabled: false,
        defaultAiMonthlyLimit: 100,
      });

      const error = await service.register(REGISTER).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: SIGNUPS_PAUSED,
      });
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.register(REGISTER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(await member());

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens for valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(await member());

      const result = await service.login({
        email: 'jane@example.com',
        password: 'correct-password',
      });

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user.organizationName).toBe('Acme Artists');
      expect(result.user.organizationCurrency).toBe('ZAR');
    });

    it('refuses a suspended business with a clear code, and issues no session', async () => {
      prisma.user.findFirst.mockResolvedValue(
        await member({ suspendedAt: new Date() }),
      );

      const error = await service
        .login({ email: 'jane@example.com', password: 'correct-password' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: ORGANIZATION_SUSPENDED,
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("doesn't reveal a suspension to someone with the wrong password", async () => {
      prisma.user.findFirst.mockResolvedValue(
        await member({ suspendedAt: new Date() }),
      );

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('flags platform admins from the allowlist, ignoring case and spaces', async () => {
      prisma.user.findFirst.mockResolvedValue(
        await member({}, 'boss@artbh.local'),
      );

      const result = await service.login({
        email: 'boss@artbh.local',
        password: 'correct-password',
      });

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
        organization: {
          id: 'org-1',
          name: 'Acme Artists',
          currency: 'USD',
          suspendedAt: null,
          ...org,
        },
      },
    });

    it('rotates the refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(token());

      const result = await service.refresh('old');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('refuses a suspended business and burns the token it was given', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        token({ suspendedAt: new Date() }),
      );

      const error = await service.refresh('old').catch((e: unknown) => e);

      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: ORGANIZATION_SUSPENDED,
      });
      expect(prisma.refreshToken.update).toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('register sends a verification email', () => {
    it('stores only the hash of the link token and emails the token itself', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Artists',
        currency: 'USD',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
        emailVerifiedAt: null,
      });

      const result = await service.register({
        ...REGISTER,
        email: '  Jane@Example.com ',
      });

      expect(prisma.user.create.mock.calls[0][0].data.email).toBe(
        'jane@example.com',
      );
      const stored = prisma.authToken.create.mock.calls[0][0].data;
      const sentToken = mail.verifyEmail.mock.calls[0][1] as string;
      expect(stored.purpose).toBe('EMAIL_VERIFICATION');
      expect(stored.tokenHash).toBe(hashLinkToken(sentToken));
      expect(stored.tokenHash).not.toBe(sentToken);
      expect(result.user.emailVerified).toBe(false);
    });

    it('still signs the user up when the email cannot be sent', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Artists',
        currency: 'USD',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
        emailVerifiedAt: null,
      });
      mail.verifyEmail.mockRejectedValue(new Error('SMTP down'));

      await expect(service.register(REGISTER)).resolves.toMatchObject({
        accessToken: 'signed-access-token',
      });
    });
  });

  describe('forgotPassword', () => {
    it('answers the same for unknown addresses and sends nothing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword('nobody@example.com'),
      ).resolves.toEqual({ ok: true });
      expect(mail.passwordReset).not.toHaveBeenCalled();
    });

    it('emails a one-hour link to a real account', async () => {
      prisma.user.findFirst.mockResolvedValue(await member());
      prisma.authToken.count.mockResolvedValue(0);

      await service.forgotPassword('JANE@example.com');

      const stored = prisma.authToken.create.mock.calls[0][0].data;
      expect(stored.purpose).toBe('PASSWORD_RESET');
      expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        59 * 60 * 1000,
      );
      expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        60 * 60 * 1000,
      );
      expect(mail.passwordReset).toHaveBeenCalledTimes(1);
    });

    it('stops after three emails an hour, still answering ok', async () => {
      prisma.user.findFirst.mockResolvedValue(await member());
      prisma.authToken.count.mockResolvedValue(3);

      await expect(service.forgotPassword('jane@example.com')).resolves.toEqual(
        { ok: true },
      );
      expect(mail.passwordReset).not.toHaveBeenCalled();
    });

    it('sends nothing for a suspended business', async () => {
      prisma.user.findFirst.mockResolvedValue(
        await member({ suspendedAt: new Date() }),
      );

      await service.forgotPassword('jane@example.com');

      expect(mail.passwordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetToken = async (over: Record<string, unknown> = {}) => ({
      id: 'tok-1',
      userId: 'user-1',
      purpose: 'PASSWORD_RESET',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: await member(),
      ...over,
    });

    it('sets the new password, retires every reset link, signs out every session, and verifies the email', async () => {
      prisma.authToken.findUnique.mockResolvedValue(await resetToken());

      await service.resetPassword({
        token: 'the-token-from-the-email',
        password: 'BrandNew123!',
      });

      expect(prisma.authToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashLinkToken('the-token-from-the-email') },
        }),
      );
      const update = prisma.user.update.mock.calls[0][0];
      expect(
        await bcrypt.compare('BrandNew123!', update.data.passwordHash),
      ).toBe(true);
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', purpose: 'PASSWORD_RESET', usedAt: null },
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
        }),
      );
    });

    it.each([
      ['an unknown token', null],
      ['a used link', { usedAt: new Date() }],
      ['an expired link', { expiresAt: new Date(Date.now() - 1) }],
      ['a verification link', { purpose: 'EMAIL_VERIFICATION' }],
    ])('refuses %s and changes nothing', async (_label, over) => {
      prisma.authToken.findUnique.mockResolvedValue(
        over === null ? null : await resetToken(over),
      );

      await expect(
        service.resetPassword({
          token: 'x'.repeat(20),
          password: 'BrandNew123!',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const verifyToken = async (
      over: Record<string, unknown> = {},
      user: Record<string, unknown> = {},
    ) => ({
      id: 'tok-2',
      userId: 'user-1',
      purpose: 'EMAIL_VERIFICATION',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...(await member()), ...user },
      ...over,
    });

    it('marks the address verified and uses up the link', async () => {
      prisma.authToken.findUnique.mockResolvedValue(await verifyToken());

      await expect(service.verifyEmail('t'.repeat(20))).resolves.toEqual({
        verified: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.authToken.update).toHaveBeenCalledWith({
        where: { id: 'tok-2' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('is fine with the link being opened again after it worked', async () => {
      prisma.authToken.findUnique.mockResolvedValue(
        await verifyToken(
          { usedAt: new Date() },
          { emailVerifiedAt: new Date() },
        ),
      );

      await expect(service.verifyEmail('t'.repeat(20))).resolves.toEqual({
        verified: true,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an expired link for an unverified address', async () => {
      prisma.authToken.findUnique.mockResolvedValue(
        await verifyToken({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.verifyEmail('t'.repeat(20))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    it('does nothing for an already verified address', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...(await member()),
        emailVerifiedAt: new Date(),
      });

      await expect(service.resendVerification('user-1')).resolves.toEqual({
        sent: false,
      });
      expect(mail.verifyEmail).not.toHaveBeenCalled();
    });

    it('asks the user to wait when the last email went out under a minute ago', async () => {
      prisma.user.findUnique.mockResolvedValue(await member());
      prisma.authToken.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 10_000),
      });

      await expect(service.resendVerification('user-1')).rejects.toMatchObject({
        status: 429,
      });
    });

    it('sends a new link otherwise', async () => {
      prisma.user.findUnique.mockResolvedValue(await member());
      prisma.authToken.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 5 * 60_000),
      });

      await expect(service.resendVerification('user-1')).resolves.toEqual({
        sent: true,
      });
      expect(mail.verifyEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('invitations', () => {
    const invite = (over: Record<string, unknown> = {}) => ({
      id: 'inv-1',
      organizationId: 'org-1',
      email: 'tendai@example.com',
      role: 'FINANCE',
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      organization: {
        id: 'org-1',
        name: 'Acme Artists',
        currency: 'USD',
        suspendedAt: null,
      },
      invitedBy: { firstName: 'Jane', lastName: 'Doe' },
      ...over,
    });

    it('shows the invite details for a valid link', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invite());

      await expect(
        service.invitationPreview('i'.repeat(20)),
      ).resolves.toMatchObject({
        email: 'tendai@example.com',
        role: 'FINANCE',
        organizationName: 'Acme Artists',
        invitedByName: 'Jane Doe',
      });
    });

    it.each([
      ['accepted', { acceptedAt: new Date() }],
      ['cancelled', { revokedAt: new Date() }],
      ['expired', { expiresAt: new Date(Date.now() - 1) }],
    ])('treats a %s invite as gone', async (_label, over) => {
      prisma.invitation.findUnique.mockResolvedValue(invite(over));

      await expect(
        service.invitationPreview('i'.repeat(20)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates the account in the inviting business with the invited role, already verified, and signs in', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invite());
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'user-2',
          ...data,
        }),
      );

      const result = await service.acceptInvitation({
        token: 'i'.repeat(20),
        firstName: 'Tendai',
        lastName: 'Moyo',
        password: 'Welcome123!',
      });

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: 'org-1',
        email: 'tendai@example.com',
        role: 'FINANCE',
      });
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { acceptedAt: expect.any(Date) },
      });
      expect(result.user).toMatchObject({
        role: 'FINANCE',
        organizationName: 'Acme Artists',
        emailVerified: true,
      });
    });

    it('refuses when the address got an account in the meantime', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invite());
      prisma.user.findFirst.mockResolvedValue({ id: 'someone' });

      await expect(
        service.acceptInvitation({
          token: 'i'.repeat(20),
          firstName: 'T',
          lastName: 'M',
          password: 'Welcome123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
