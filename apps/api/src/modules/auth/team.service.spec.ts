import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthMailService } from './auth-mail.service';
import type { JwtPayload } from './auth.types';
import { TeamService } from './team.service';
import { hashLinkToken } from './tokens';

describe('TeamService', () => {
  const owner: JwtPayload = {
    sub: 'owner-1',
    email: 'jane@example.com',
    organizationId: 'org-1',
    role: 'OWNER',
    emailVerified: true,
  };
  const manager: JwtPayload = { ...owner, sub: 'manager-1', role: 'MANAGER' };
  const staff: JwtPayload = { ...owner, sub: 'staff-1', role: 'STAFF' };

  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    invitation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    organization: { findUnique: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    authToken: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { invitation: jest.Mock };
  let team: TeamService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      invitation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme Artists' }),
      },
      refreshToken: { updateMany: jest.fn() },
      authToken: { deleteMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    prisma.user.findUnique.mockResolvedValue({
      firstName: 'Jane',
      lastName: 'Doe',
    });
    mail = { invitation: jest.fn().mockResolvedValue(undefined) };
    team = new TeamService(
      prisma as unknown as PrismaService,
      mail as unknown as AuthMailService,
    );
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'owner-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          role: 'OWNER',
          createdAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      ]);
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          email: 'a@x.com',
          role: 'STAFF',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() - 1),
          invitedBy: { firstName: 'Jane', lastName: 'Doe' },
        },
      ]);
    });

    it('shows members and pending invites to an owner, marking expired ones and "you"', async () => {
      const result = await team.list(owner);

      expect(result.members[0]).toMatchObject({
        isYou: true,
        emailVerified: true,
      });
      expect(result.invitations[0]).toMatchObject({
        email: 'a@x.com',
        expired: true,
        invitedByName: 'Jane Doe',
      });
    });

    it('hides invites from staff', async () => {
      const result = await team.list(staff);

      expect(result.invitations).toEqual([]);
      expect(prisma.invitation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('invite', () => {
    it('stores a hashed 7-day link, replaces older invites to the same address, and emails the token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'inv-2',
          ...data,
        }),
      );

      await team.invite(manager, {
        email: '  Tendai@Example.com ',
        role: 'FINANCE',
      });

      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          email: 'tendai@example.com',
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
      const data = prisma.invitation.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: 'org-1',
        email: 'tendai@example.com',
        role: 'FINANCE',
        invitedById: 'manager-1',
      });
      const [to, token, details] = mail.invitation.mock.calls[0];
      expect(to).toBe('tendai@example.com');
      expect(data.tokenHash).toBe(hashLinkToken(token));
      expect(details).toEqual({
        inviterName: 'Jane Doe',
        organizationName: 'Acme Artists',
        role: 'FINANCE',
      });
      expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        6.9 * 24 * 3600 * 1000,
      );
    });

    it('refuses someone who is already a member', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        organizationId: 'org-1',
      });

      await expect(
        team.invite(owner, { email: 'x@example.com', role: 'STAFF' }),
      ).rejects.toThrow(/already a member/);
    });

    it('refuses an address that belongs to another business', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        organizationId: 'org-2',
      });

      await expect(
        team.invite(owner, { email: 'x@example.com', role: 'STAFF' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });
  });

  describe('resend and cancel', () => {
    it('resending rotates the link so the old one stops working', async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        email: 'a@x.com',
        role: 'STAFF',
        tokenHash: 'old',
      });
      prisma.invitation.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'inv-1',
          email: 'a@x.com',
          role: 'STAFF',
          ...data,
        }),
      );

      await team.resend(owner, 'inv-1');

      const data = prisma.invitation.update.mock.calls[0][0].data;
      expect(data.tokenHash).not.toBe('old');
      expect(data.tokenHash).toBe(
        hashLinkToken(mail.invitation.mock.calls[0][1]),
      );
    });

    it("can't touch another business's invite", async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(team.cancel(owner, 'inv-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'inv-9',
          organizationId: 'org-1',
          acceptedAt: null,
          revokedAt: null,
        },
      });
    });
  });

  describe('changeRole', () => {
    it("changes a member's role", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'staff-1', role: 'STAFF' });
      prisma.user.update.mockResolvedValue({ id: 'staff-1', role: 'FINANCE' });

      await expect(
        team.changeRole(owner, 'staff-1', { role: 'FINANCE' }),
      ).resolves.toEqual({ id: 'staff-1', role: 'FINANCE' });
    });

    it("refuses to change the owner's role or your own", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'owner-2', role: 'OWNER' });
      await expect(
        team.changeRole(owner, 'owner-2', { role: 'STAFF' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        team.changeRole(owner, 'owner-1', { role: 'STAFF' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only finds members of the same business', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        team.changeRole(owner, 'elsewhere', { role: 'STAFF' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'elsewhere', organizationId: 'org-1', removedAt: null },
      });
    });
  });

  describe('remove', () => {
    it('locks the member out, signs them out everywhere and frees their email, keeping the row', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'staff-1', role: 'STAFF' });

      await team.remove(owner, 'staff-1');

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.removedAt).toBeInstanceOf(Date);
      expect(data.email).toBe('removed+staff-1@removed.artbh.invalid');
      expect(data.passwordHash).toBe('!removed');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'staff-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'staff-1' },
      });
    });

    it("won't remove the owner", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'owner-2', role: 'OWNER' });

      await expect(team.remove(owner, 'owner-2')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'owner-1',
        passwordHash: await bcrypt.hash('right-password', 10),
      });
    });

    it('makes the member Owner and the old owner a Manager', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'manager-1',
        role: 'MANAGER',
      });

      await team.transferOwnership(owner, {
        userId: 'manager-1',
        password: 'right-password',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'manager-1' },
        data: { role: 'OWNER' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'owner-1' },
        data: { role: 'MANAGER' },
      });
    });

    it('needs the owner password', async () => {
      await expect(
        team.transferOwnership(owner, {
          userId: 'manager-1',
          password: 'wrong',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
