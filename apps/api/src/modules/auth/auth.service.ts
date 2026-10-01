import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdmins } from '../platform/platform-admins';
import { PlatformConfigService } from '../platform/platform-config.service';
import { SIGNUPS_PAUSED, suspendedForbidden } from '../platform/suspension';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult, JwtPayload } from './auth.types';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly platformAdmins: PlatformAdmins,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const platform = await this.platformConfig.get();
    if (!platform.signupsEnabled) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: SIGNUPS_PAUSED,
        message: 'New sign-ups are paused at the moment. Please try again later.',
      });
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const organization = await this.prisma.organization.create({
      data: { name: dto.organizationName, aiMonthlyLimit: platform.defaultAiMonthlyLimit },
    });

    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'OWNER',
      },
    });

    return this.issueTokens(
      user.id,
      user.email,
      organization.id,
      user.role,
      organization.name,
      organization.currency,
      user.firstName,
      user.lastName,
    );
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    // Checked only after the password, so a suspension isn't revealed to someone guessing.
    if (user.organization.suspendedAt) throw suspendedForbidden();

    return this.issueTokens(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      user.organization.name,
      user.organization.currency,
      user.firstName,
      user.lastName,
    );
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { organization: true } } },
    });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    const { user } = existingToken;
    if (user.organization.suspendedAt) throw suspendedForbidden();

    return this.issueTokens(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      user.organization.name,
      user.organization.currency,
      user.firstName,
      user.lastName,
    );
  }

  private async issueTokens(
    userId: string,
    email: string,
    organizationId: string,
    role: AuthResult['user']['role'],
    organizationName: string,
    organizationCurrency: string,
    firstName: string,
    lastName: string,
  ): Promise<AuthResult> {
    const payload: JwtPayload = { sub: userId, email, organizationId, role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: Number(
        this.configService.get<string>('JWT_ACCESS_EXPIRY_SECONDS') ?? 900,
      ),
    });

    const refreshTokenValue = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshTokenValue,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        organizationId,
        organizationName,
        organizationCurrency,
        isPlatformAdmin: this.platformAdmins.isAdmin(email),
      },
    };
  }
}
