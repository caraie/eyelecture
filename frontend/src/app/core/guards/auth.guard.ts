import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

/** Requires a session. Remembers where the user was heading. */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
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
