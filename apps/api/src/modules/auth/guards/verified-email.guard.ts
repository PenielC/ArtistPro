import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPayload } from '../auth.types';
import { EMAIL_NOT_VERIFIED } from '../tokens';

/**
 * For actions that email people outside the business (clients, invitees) or hand out payment links.
 * Unverified accounts can use everything else, so this stops sign-ups with fake addresses from
 * sending mail through ArtBH without getting in a new user's way. Use after JwtAuthGuard.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    if (user.emailVerified) return true;
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: EMAIL_NOT_VERIFIED,
      message: `Please confirm your email address first. We sent a link to ${user.email}; you can send a new one from the banner at the top of the page.`,
    });
  }
}
