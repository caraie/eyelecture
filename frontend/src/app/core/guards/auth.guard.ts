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

  // One destination, decided before anything is compared against the URL.
  //
  // Checking each requirement against the URL in turn looks equivalent and is
  // not: with two of them outstanding, the screen for the first fails the test
  // for the second and vice versa, and the router ping-pongs between them
  // until the tab stops responding. An account on a temporary password with no
  // personal address — which is every account an admin creates — could not
  // sign in at all.
  //
  // Order still matters, and it is the same order: the password first, because
  // somebody who has several problems has to solve that one before anything
  // else is worth asking for; the personal address last, because it only
  // applies to accounts that already finished signing up.
  // A missing personal address is deliberately absent: it is asked for by the
  // banner in the shell, not by taking the app away. See EYE-22.
  const pinnedTo = auth.mustChangePassword()
    ? FORCED_PASSWORD_ROUTE
    : auth.mustCompleteProfile()
      ? COMPLETE_PROFILE_ROUTE
      : null;

  if (pinnedTo && !state.url.startsWith(pinnedTo)) {
    return router.createUrlTree([pinnedTo]);
  }

  return true;
};

const FORCED_PASSWORD_ROUTE = '/app/change-password';
const COMPLETE_PROFILE_ROUTE = '/app/complete-profile';

/**
 * The inverse, for the complete-profile screen. Somebody who already finished has
 * nothing to do there, and landing on a form full of answers they cannot change
 * reads as a bug.
 */
export const completeProfileGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return auth.mustCompleteProfile() ? true : router.createUrlTree(['/app/dashboard']);
};

/** The inverse, for the add-a-personal-address screen. */
export const personalEmailGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return auth.needsPersonalEmail()
    ? true
    : router.createUrlTree(['/app/dashboard']);
};

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
