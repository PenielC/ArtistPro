import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Organization, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdmins } from '../platform/platform-admins';
import { PlatformConfigService } from '../platform/platform-config.service';
import { SIGNUPS_PAUSED, suspendedForbidden } from '../platform/suspension';
import { AuthMailService } from './auth-mail.service';
import { AcceptInvitationDto, ResetPasswordDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult, JwtPayload } from './auth.types';
import {
  EMAIL_VERIFICATION_TTL_MS,
  MAX_RESETS_PER_HOUR,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_RESEND_GAP_MS,
  hashLinkToken,
  newLinkToken,
} from './tokens';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INVALID_LINK =
  'This link is invalid or has expired. Please ask for a new one.';

/** Email addresses are matched without regard to case, so "Grace@x.com" and "grace@x.com" are one account. */
export const sameEmail = (email: string) => ({
  equals: email.trim(),
  mode: 'insensitive' as const,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly platformAdmins: PlatformAdmins,
    private readonly mail: AuthMailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const platform = await this.platformConfig.get();
    if (!platform.signupsEnabled) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: SIGNUPS_PAUSED,
        message:
          'New sign-ups are paused at the moment. Please try again later.',
      });
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: sameEmail(email) },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.organizationName,
        aiMonthlyLimit: platform.defaultAiMonthlyLimit,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'OWNER',
      },
    });

    await this.sendVerification(user).catch((err: Error) =>
      this.logger.warn(
        `Could not send the verification email to a new user: ${err.message}`,
      ),
    );
    return this.issueTokens(user, organization);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: sameEmail(dto.email), removedAt: null },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    // Checked only after the password, so a suspension isn't revealed to someone guessing.
    if (user.organization.suspendedAt) throw suspendedForbidden();

    return this.issueTokens(user, user.organization);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { organization: true } } },
    });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt < new Date() ||
      existingToken.user.removedAt
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    const { user } = existingToken;
    if (user.organization.suspendedAt) throw suspendedForbidden();

    return this.issueTokens(user, user.organization);
  }

  /** The signed-in user as the web app needs it, read fresh so role and verification changes show at once. */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || user.removedAt) throw new UnauthorizedException();
    return this.profile(user, user.organization);
  }

  // ------------------------------------------------------------------ password reset

  /**
   * Always answers the same way, whether or not the address has an account, so the form can't be used
   * to find out who uses ArtBH. A real account gets a one-hour link (at most three an hour).
   */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email: sameEmail(email), removedAt: null },
      include: { organization: { select: { suspendedAt: true } } },
    });
    if (!user || user.organization.suspendedAt) return { ok: true };

    const recent = await this.prisma.authToken.count({
      where: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= MAX_RESETS_PER_HOUR) return { ok: true };

    const { token, hash } = newLinkToken();
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.mail.passwordReset(user, token);
    return { ok: true };
  }

  /**
   * Sets a new password from a reset link. The link works once; every other open reset link is retired
   * and every session is signed out, so anyone who had the old password is locked out. Following the
   * link also proves the address, so the account counts as verified.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashLinkToken(dto.token) },
      include: {
        user: { include: { organization: { select: { suspendedAt: true } } } },
      },
    });
    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.user.removedAt
    ) {
      throw new BadRequestException(INVALID_LINK);
    }
    if (record.user.organization.suspendedAt) throw suspendedForbidden();

    const now = new Date();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          emailVerifiedAt: record.user.emailVerifiedAt ?? now,
        },
      }),
      this.prisma.authToken.updateMany({
        where: {
          userId: record.userId,
          purpose: 'PASSWORD_RESET',
          usedAt: null,
        },
        data: { usedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    return { ok: true };
  }

  // ------------------------------------------------------------------ email verification

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashLinkToken(token) },
      include: { user: true },
    });
    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
      record.user.removedAt
    ) {
      throw new BadRequestException(INVALID_LINK);
    }
    // Opening the link twice (or from a second device) is fine once the address is verified.
    if (record.user.emailVerifiedAt) return { verified: true };
    if (record.usedAt || record.expiresAt < new Date())
      throw new BadRequestException(INVALID_LINK);

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
      }),
      this.prisma.authToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
    ]);
    return { verified: true };
  }

  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.removedAt) throw new UnauthorizedException();
    if (user.emailVerifiedAt) return { sent: false };

    const last = await this.prisma.authToken.findFirst({
      where: { userId, purpose: 'EMAIL_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
    });
    if (
      last &&
      Date.now() - last.createdAt.getTime() < VERIFICATION_RESEND_GAP_MS
    ) {
      throw new HttpException(
        'We just sent one. Please wait a minute before asking again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.sendVerification(user);
    return { sent: true };
  }

  private async sendVerification(
    user: Pick<User, 'id' | 'email' | 'firstName'>,
  ) {
    const { token, hash } = newLinkToken();
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    await this.mail.verifyEmail(user, token);
  }

  // ------------------------------------------------------------------ invitations

  /** What the accept page shows before the invitee signs up. */
  async invitationPreview(token: string) {
    const invite = await this.openInvitation(token);
    return {
      email: invite.email,
      role: invite.role,
      organizationName: invite.organization.name,
      invitedByName:
        `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`.trim(),
      expiresAt: invite.expiresAt,
    };
  }

  /** Creates the invitee's account in the inviting business and signs them in. */
  async acceptInvitation(dto: AcceptInvitationDto): Promise<AuthResult> {
    const invite = await this.openInvitation(dto.token);
    const taken = await this.prisma.user.findFirst({
      where: { email: sameEmail(invite.email) },
    });
    if (taken) {
      throw new ConflictException(
        'This email already has an ArtBH account. Sign in instead, or ask for an invite to a different email.',
      );
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: invite.organizationId,
          email: invite.email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: invite.role,
          // The invite reached this inbox, which proves the address.
          emailVerifiedAt: now,
        },
      });
      await tx.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });
      return created;
    });
    return this.issueTokens(user, invite.organization);
  }

  private async openInvitation(token: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashLinkToken(token) },
      include: {
        organization: true,
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt < new Date()
    ) {
      throw new NotFoundException(
        'This invitation is no longer valid. Ask the person who invited you to send a new one.',
      );
    }
    if (invite.organization.suspendedAt) throw suspendedForbidden();
    return invite;
  }

  // ------------------------------------------------------------------ tokens

  private profile(user: User, organization: Organization): AuthResult['user'] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationCurrency: organization.currency,
      emailVerified: user.emailVerifiedAt !== null,
      isPlatformAdmin: this.platformAdmins.isAdmin(user.email),
    };
  }

  private async issueTokens(
    user: User,
    organization: Organization,
  ): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: Number(
        this.configService.get<string>('JWT_ACCESS_EXPIRY_SECONDS') ?? 900,
      ),
    });

    const refreshTokenValue = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenValue,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: this.profile(user, organization),
    };
  }
}
