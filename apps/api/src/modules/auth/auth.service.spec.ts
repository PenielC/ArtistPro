import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    organization: { create: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      organization: { create: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-access-token') };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
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

      const result = await service.register({
        organizationName: 'Acme Artists',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user.role).toBe('OWNER');
      expect(result.user.organizationId).toBe('org-1');
      expect(result.user.organizationCurrency).toBe('USD');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          organizationName: 'Acme Artists',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          password: 'Password123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
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
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        passwordHash,
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
        organizationId: 'org-1',
        organization: { name: 'Acme Artists' },
      });

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        passwordHash,
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'OWNER',
        organizationId: 'org-1',
        organization: { name: 'Acme Artists', currency: 'ZAR' },
      });

      const result = await service.login({ email: 'jane@example.com', password: 'correct-password' });

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user.organizationName).toBe('Acme Artists');
      expect(result.user.organizationCurrency).toBe('ZAR');
    });
  });
});
