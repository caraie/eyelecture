import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

/**
 * Requires a session. Remembers where the user was heading.
 *
 * Also the choke point for a pending password change: an account still on the
 * temporary password an admin issued gets pinned to that one screen, because the API
 * refuses everything else anyway and letting them navigate elsewhere just produces a
 * page of failed requests.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (auth.mustChangePassword() && !state.url.startsWith(FORCED_PASSWORD_ROUTE)) {
    return router.createUrlTree([FORCED_PASSWORD_ROUTE]);
  }

  return true;
};

const FORCED_PASSWORD_ROUTE = '/app/change-password';

/**
 * The inverse, for the change-password screen itself. Somebody who has already
 * chosen a password should not be stuck on a screen telling them to choose one, so
 * a direct visit sends them on unless they asked for it via the profile.
 */
export const passwordChangeGuard: CanActivateFn = (route): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  if (auth.mustChangePassword()) return true;

  // `?voluntary=1` is how the profile links here on purpose.
  return route.queryParamMap.get('voluntary') === '1'
    ? true
    : router.createUrlTree(['/app/profile']);
};

/** For login/register: a signed-in user should not see them again. */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/app']) : true;
};

/**
 * Route-level role check. The server enforces the same rules — this only keeps
 * the user from navigating into a page that would fail every request it makes.
 */
export const roleGuard = (...allowed: UserRole[]): CanActivateFn => {
  return (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login']);
    }

    const role = auth.role();
    if (role && allowed.includes(role)) return true;

    return router.createUrlTree(['/app/forbidden']);
  };
};
