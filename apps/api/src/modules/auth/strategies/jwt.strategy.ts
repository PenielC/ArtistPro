import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { suspendedUnauthorized } from '../../platform/suspension';
import { JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  /**
   * One small lookup per request so changes take effect immediately, not when the access token
   * expires: a suspension, a removed member, a new role, a just-verified email. The role and email
   * returned are the database's, never the token's.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        email: true,
        role: true,
        organizationId: true,
        emailVerifiedAt: true,
        removedAt: true,
        organization: { select: { suspendedAt: true } },
      },
    });
    if (!user || user.removedAt) throw new UnauthorizedException();
    if (user.organization.suspendedAt) throw suspendedUnauthorized();
    return {
      sub: payload.sub,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
