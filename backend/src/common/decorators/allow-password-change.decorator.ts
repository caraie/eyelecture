import { SetMetadata } from '@nestjs/common';

export const ALLOWS_PENDING_PASSWORD_KEY = 'allowsPendingPassword';

/**
 * Lets a route run for a user who is still carrying an admin-issued temporary
 * password. Only the handful of endpoints needed to get out of that state should
 * have it: reading your own account, changing the password, signing out.
 *
 * The default is to refuse, so a new endpoint is unreachable under a temporary
 * password until someone deliberately says otherwise.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOWS_PENDING_PASSWORD_KEY, true);
