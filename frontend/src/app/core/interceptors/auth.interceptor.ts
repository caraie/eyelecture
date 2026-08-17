import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/** Endpoints that must never carry a token or trigger a refresh loop. */
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  // Listed before the shorter '/auth/verify-email' would be enough on its own, but
  // spelling it out keeps the intent readable: confirming a personal address is also
  // token-authenticated, so a 401 from a stale link must surface rather than kick off
  // a pointless refresh and rotate the refresh token on the way.
  '/auth/verify-secondary-email',
  '/auth/resend-verification',
  '/institutions/public',
];

const isPublic = (url: string): boolean =>
  PUBLIC_PATHS.some((path) => url.includes(path));

// Shared across concurrent requests so a burst of 401s produces one refresh, not N.
let refreshInFlight = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

const withToken = (req: HttpRequest<unknown>, token: string): HttpRequest<unknown> =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);

  if (isPublic(req.url)) return next(req);

  const token = auth.accessToken;
  const request = token ? withToken(req, token) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      const is401 = error instanceof HttpErrorResponse && error.status === 401;

      if (!is401 || !auth.refreshToken) return throwError(() => error);

      // A second 401 on the retried request means the refresh itself is no good.
      if (req.headers.has('X-Retry-After-Refresh')) {
        auth.logout();
        return throwError(() => error);
      }

      if (refreshInFlight) {
        // Park this request until the in-flight refresh publishes a token.
        return refreshedToken$.pipe(
          filter((value): value is string => value !== null),
          take(1),
          switchMap((fresh) =>
            next(
              withToken(req, fresh).clone({
                setHeaders: { 'X-Retry-After-Refresh': '1' },
              }),
            ),
          ),
        );
      }

      refreshInFlight = true;
      refreshedToken$.next(null);

      return auth.refreshSession().pipe(
        switchMap((tokens) => {
          refreshInFlight = false;
          refreshedToken$.next(tokens.accessToken);
          return next(
            withToken(req, tokens.accessToken).clone({
              setHeaders: { 'X-Retry-After-Refresh': '1' },
            }),
          );
        }),
        catchError((refreshError: unknown) => {
          refreshInFlight = false;
          auth.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
