import { SetMetadata } from '@nestjs/common';

export const ALLOWS_MISSING_PERSONAL_EMAIL_KEY = 'allowsMissingPersonalEmail';

/**
 * Lets a route run for an account made before the personal address was required.
 *
 * The same shape as @AllowPendingProfile: reading your own account, supplying the
 * address, and signing out. The default is to refuse, so a new endpoint is
 * unreachable from an account in that state until somebody deliberately says
 * otherwise.
 */
export const AllowMissingPersonalEmail = () =>
  SetMetadata(ALLOWS_MISSING_PERSONAL_EMAIL_KEY, true);
