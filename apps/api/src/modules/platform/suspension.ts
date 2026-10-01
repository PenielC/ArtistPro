import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/** Machine-readable codes so the web app can tell "suspended" apart from an ordinary expired session. */
export const ORGANIZATION_SUSPENDED = 'ORGANIZATION_SUSPENDED';
export const SIGNUPS_PAUSED = 'SIGNUPS_PAUSED';

// The admin's reason is internal; members only learn that the business is suspended.
const SUSPENDED_MESSAGE = 'This business has been suspended. Please contact ArtBH support.';

/** Login and token refresh: the credentials are fine, but access is refused. */
export function suspendedForbidden() {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', code: ORGANIZATION_SUSPENDED, message: SUSPENDED_MESSAGE });
}

/** Any authenticated request: the access token is no longer honoured. */
export function suspendedUnauthorized() {
  return new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', code: ORGANIZATION_SUSPENDED, message: SUSPENDED_MESSAGE });
}
