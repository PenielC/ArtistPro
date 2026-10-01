import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthMailService } from './auth-mail.service';
import { sameEmail } from './auth.service';
import type { JwtPayload } from './auth.types';
import {
  ChangeRoleDto,
  InviteMemberDto,
  TransferOwnershipDto,
} from './dto/team.dto';
import { INVITATION_TTL_MS, newLinkToken } from './tokens';

const MANAGES_INVITES: UserRole[] = [UserRole.OWNER, UserRole.MANAGER];

/**
 * The people in a business. Owners and Managers invite (and resend or cancel invites); only the Owner
 * changes roles, removes members or hands the business to someone else. Every change takes effect on
 * the member's next request, because the JWT strategy reads role and membership from the database.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: AuthMailService,
  ) {}

  async list(actor: JwtPayload) {
    const members = await this.prisma.user.findMany({
      where: { organizationId: actor.organizationId, removedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
    });
    const invitations = MANAGES_INVITES.includes(actor.role)
      ? await this.prisma.invitation.findMany({
          where: {
            organizationId: actor.organizationId,
            acceptedAt: null,
            revokedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          include: {
            invitedBy: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const now = new Date();
    return {
      members: members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        role: m.role,
        joinedAt: m.createdAt,
        emailVerified: m.emailVerifiedAt !== null,
        isYou: m.id === actor.sub,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedByName:
          `${i.invitedBy.firstName} ${i.invitedBy.lastName}`.trim(),
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        expired: i.expiresAt < now,
      })),
    };
  }

  async invite(actor: JwtPayload, dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: sameEmail(email), removedAt: null },
    });
    if (existing?.organizationId === actor.organizationId) {
      throw new ConflictException(
        `${email} is already a member of this business.`,
      );
    }
    if (existing) {
      throw new ConflictException(
        `${email} already has an ArtBH account, so it can't be invited. Ask them for a different email address.`,
      );
    }

    // A fresh invite replaces any earlier one to the same address, so only the newest link works.
    await this.prisma.invitation.updateMany({
      where: {
        organizationId: actor.organizationId,
        email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    const { token, hash } = newLinkToken();
    const invite = await this.prisma.invitation.create({
      data: {
        organizationId: actor.organizationId,
        email,
        role: dto.role,
        tokenHash: hash,
        invitedById: actor.sub,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await this.sendInvite(actor, invite.email, invite.role, token);
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  }

  /** A new link (the old one stops working, since only its hash was kept) and another 7 days. */
  async resend(actor: JwtPayload, invitationId: string) {
    const invite = await this.pendingInvite(actor, invitationId);
    const { token, hash } = newLinkToken();
    const updated = await this.prisma.invitation.update({
      where: { id: invite.id },
      data: {
        tokenHash: hash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await this.sendInvite(actor, updated.email, updated.role, token);
    return { id: updated.id, expiresAt: updated.expiresAt };
  }

  async cancel(actor: JwtPayload, invitationId: string) {
    const invite = await this.pendingInvite(actor, invitationId);
    await this.prisma.invitation.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async changeRole(actor: JwtPayload, memberId: string, dto: ChangeRoleDto) {
    const member = await this.otherMember(actor, memberId);
    if (member.role === UserRole.OWNER) {
      throw new BadRequestException(
        "The owner's role can't be changed. Transfer ownership instead.",
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: member.id },
      data: { role: dto.role },
    });
    return { id: updated.id, role: updated.role };
  }

  /**
   * Removes a member: they're signed out everywhere at once and can't sign in again. Their past work
   * (bookings, invoices, emails sent) keeps their name; their email address is freed so they can be
   * invited elsewhere, or back here, later.
   */
  async remove(actor: JwtPayload, memberId: string) {
    const member = await this.otherMember(actor, memberId);
    if (member.role === UserRole.OWNER)
      throw new BadRequestException("The owner can't be removed.");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: member.id },
        data: {
          removedAt: now,
          email: `removed+${member.id}@removed.artbh.invalid`,
          passwordHash: '!removed',
          calendarFeedToken: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: member.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.authToken.deleteMany({ where: { userId: member.id } }),
    ]);
    return { ok: true };
  }

  /** Hands the business to another member, who becomes Owner; the current owner becomes a Manager. */
  async transferOwnership(actor: JwtPayload, dto: TransferOwnershipDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (!owner || !(await bcrypt.compare(dto.password, owner.passwordHash))) {
      throw new UnauthorizedException('That password is not right.');
    }
    const member = await this.otherMember(actor, dto.userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: member.id },
        data: { role: UserRole.OWNER },
      }),
      this.prisma.user.update({
        where: { id: owner.id },
        data: { role: UserRole.MANAGER },
      }),
    ]);
    return { ok: true, newOwnerId: member.id };
  }

  private async otherMember(actor: JwtPayload, memberId: string) {
    if (memberId === actor.sub)
      throw new BadRequestException("You can't do that to your own account.");
    const member = await this.prisma.user.findFirst({
      where: {
        id: memberId,
        organizationId: actor.organizationId,
        removedAt: null,
      },
    });
    if (!member) throw new NotFoundException('Team member not found.');
    return member;
  }

  private async pendingInvite(actor: JwtPayload, invitationId: string) {
    const invite = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: actor.organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
    });
    if (!invite) throw new NotFoundException('Invitation not found.');
    return invite;
  }

  private async sendInvite(
    actor: JwtPayload,
    email: string,
    role: UserRole,
    token: string,
  ) {
    const [inviter, organization] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actor.sub },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: actor.organizationId },
        select: { name: true },
      }),
    ]);
    if (!inviter || !organization) throw new ForbiddenException();
    await this.mail.invitation(email, token, {
      inviterName: `${inviter.firstName} ${inviter.lastName}`.trim(),
      organizationName: organization.name,
      role,
    });
  }
}
