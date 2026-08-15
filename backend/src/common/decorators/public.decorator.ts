import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the global JWT guard. Authentication is on by default, so
 * forgetting this decorator fails closed rather than open.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
