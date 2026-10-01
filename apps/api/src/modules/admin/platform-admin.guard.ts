import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.types';
import { PlatformAdmins } from '../platform/platform-admins';

/** Use after JwtAuthGuard. The allowlist is checked on every call; the client's flag is never trusted. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly admins: PlatformAdmins) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!this.admins.isAdmin(user?.email)) throw new ForbiddenException('Platform admins only.');
    return true;
  }
}
