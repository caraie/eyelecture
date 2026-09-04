import { SetMetadata } from '@nestjs/common';

export const ALLOWS_PENDING_PROFILE_KEY = 'allowsPendingProfile';

/**
 * Lets a route run for an account that has a username and a password and nothing
 * else. Only what is needed to finish signing up, or to leave: reading your own
 * account, completing the profile, listing the institutions and reference lists the
 * form is built from, and signing out.
 *
 * The default is to refuse, so a new endpoint is unreachable from a half-finished
 * account until somebody deliberately says otherwise.
 */
export const AllowPendingProfile = () =>
  SetMetadata(ALLOWS_PENDING_PROFILE_KEY, true);
