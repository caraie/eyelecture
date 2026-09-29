import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AcceptInvitationPayload,
  AuthResponse,
  AuthTokens,
  ChangeInstitutionalEmailPayload,
  ChangeInstitutionalEmailResponse,
  ChangePasswordPayload,
  LoginPayload,
  CompleteProfilePayload,
  CompleteProfileResponse,
  RegisterPayload,
  ResendPersonalEmailResponse,
  PersonalEmailResponse,
  VerifyPersonalEmailResponse,
} from '../models/api.model';
import { TRAINEE_ROLES, User, UserRole } from '../models/user.model';

const ACCESS_TOKEN_KEY = 'eyelecture.accessToken';
const REFRESH_TOKEN_KEY = 'eyelecture.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiUrl}/auth`;

  /** The signed-in user, or null. Everything else derives from this. */
  private readonly currentUser = signal<User | null>(null);
  private readonly initialised = signal(false);

  readonly user = this.currentUser.asReadonly();
  readonly isReady = this.initialised.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => this.currentUser()?.role ?? null);
  readonly isSuperUser = computed(() => this.role() === 'super_user');
  readonly isProgramAdministrator = computed(
    () => this.role() === 'program_administrator',
  );
  readonly isTrainee = computed(() => {
    const role = this.role();
    return role !== null && TRAINEE_ROLES.includes(role);
  });
  readonly isValidated = computed(
    () => this.currentUser()?.validationStatus === 'validated',
  );
  /**
   * Can open the validation queue.
   *
   * A program administrator has to be approved first. Signing up on a recognised
   * domain attaches the institution straight away while the rank still waits on a
   * super user, so without the second condition somebody could start approving
   * people at an institution nobody has confirmed they belong to.
   *
   * Declared after `isValidated` on purpose — a computed reads its dependencies
   * lazily, so the order does not break it, but relying on that is one refactor away
   * from an undefined call.
   */
  readonly canReview = computed(
    () => this.isSuperUser() || (this.isProgramAdministrator() && this.isValidated()),
  );
  /**
   * The account is on a temporary password an admin handed out. The API refuses
   * everything but /me, change-password and logout until it is replaced, so the
   * router has to send them straight to that screen.
   */
  readonly mustChangePassword = computed(
    () => this.currentUser()?.mustChangePassword === true,
  );

  /**
   * Registered, but stopped after the username. The API refuses everything but /me,
   * complete-profile and logout until this clears, so the router has to pin them to
   * that screen rather than let them wander into pages that will only fail.
   */
  readonly mustCompleteProfile = computed(
    () => this.currentUser()?.status === 'pending_profile',
  );

  /**
   * An account made before a personal address was required. The API refuses
   * everything but /me, that one screen and logout, so the router pins them there
   * rather than letting them wander into pages that will only fail.
   */
  readonly needsPersonalEmail = computed(
    () => this.currentUser()?.needsPersonalEmail === true,
  );

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Called once at startup by an APP_INITIALIZER. Restores the session from the
   * stored token so a refresh does not bounce the user to the login screen.
   */
  restoreSession(): Observable<User | null> {
    if (!this.accessToken) {
      this.initialised.set(true);
      return of(null);
    }

    return this.http.get<User>(`${this.base}/me`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.initialised.set(true);
      }),
      catchError(() => {
        this.clearTokens();
        this.initialised.set(true);
        return of(null);
      }),
    );
  }

  /**
   * Step one. Returns a session: the next screen is the other half of the same
   * form, so the person is signed in from here on.
   */
  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/register`, payload)
      .pipe(tap((response) => this.applySession(response)));
  }

  /**
   * Redeem an invitation to administer an institution. One step rather than two:
   * the institution, the rank and the institutional address all came with the link,
   * so there is no second half of the form to send anybody to.
   */
  acceptInvitation(payload: AcceptInvitationPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/invitation/accept`, payload)
      .pipe(tap((response) => this.applySession(response)));
  }

  /** Step two. Refreshes the stored user, which is what releases the router. */
  completeProfile(
    payload: CompleteProfilePayload,
  ): Observable<CompleteProfileResponse> {
    return this.http
      .post<CompleteProfileResponse>(`${this.base}/complete-profile`, payload)
      .pipe(tap((response) => this.currentUser.set(response.user)));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/login`, payload)
      .pipe(tap((response) => this.applySession(response)));
  }

  verifyEmail(token: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/verify-email`, { token })
      .pipe(tap((response) => this.applySession(response)));
  }

  resendVerification(username: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/resend-verification`, {
      username,
    });
  }

  // --- Personal address -------------------------------------------

  /** Adds or replaces the personal address and triggers a confirmation link. */
  setPersonalEmail(personalEmail: string): Observable<PersonalEmailResponse> {
    return this.http
      .post<PersonalEmailResponse>(`${this.base}/personal-email`, {
        personalEmail,
      })
      .pipe(tap((response) => this.currentUser.set(response.user)));
  }

  resendPersonalEmailVerification(): Observable<ResendPersonalEmailResponse> {
    return this.http.post<ResendPersonalEmailResponse>(
      `${this.base}/personal-email/resend`,
      {},
    );
  }

  // --- Institutional address --------------------------------------------------

  /**
   * Change the institutional address, which is how somebody changes institution.
   * The institution they were at is kept as a past affiliation, so they do not lose
   * access to its material.
   */
  changeInstitutionalEmail(
    payload: ChangeInstitutionalEmailPayload,
  ): Observable<ChangeInstitutionalEmailResponse> {
    return this.http
      .post<ChangeInstitutionalEmailResponse>(
        `${this.base}/institutional-email`,
        payload,
      )
      .pipe(tap((response) => this.currentUser.set(response.user)));
  }

  /**
   * Confirms the personal address.
   *
   * Returns only the confirmed address — no session and no account details, because
   * the endpoint is public and the token is its only credential. The signed-in user is
   * then re-read from /me, which also covers the case where the link was opened in a
   * browser signed in as somebody else: that person's own record comes back unchanged.
   */
  verifyPersonalEmail(
    token: string,
  ): Observable<VerifyPersonalEmailResponse> {
    return this.http
      .post<VerifyPersonalEmailResponse>(
        `${this.base}/verify-personal-email`,
        { token },
      )
      .pipe(
        tap(() => {
          if (this.isAuthenticated()) this.reloadUser().subscribe();
        }),
      );
  }

  // --- Password ---------------------------------------------------------------

  /**
   * Also the way out of an admin-issued temporary password. The server revokes every
   * session and issues a fresh pair, so the tokens have to be swapped in here.
   */
  changePassword(payload: ChangePasswordPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/change-password`, payload)
      .pipe(tap((response) => this.applySession(response)));
  }

  /** Used by the HTTP interceptor when an access token expires mid-session. */
  refreshSession(): Observable<AuthTokens> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) throw new Error('No refresh token available');

    return this.http.post<AuthTokens>(`${this.base}/refresh`, { refreshToken }).pipe(
      tap((tokens) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      }),
    );
  }

  /** Re-reads the current user, e.g. after a director validates them. */
  reloadUser(): Observable<User | null> {
    return this.http.get<User>(`${this.base}/me`).pipe(
      tap((user) => this.currentUser.set(user)),
      catchError(() => of(null)),
    );
  }

  logout(redirectTo: string = '/auth/login'): void {
    const refreshToken = this.refreshToken;

    const finish = () => {
      this.clearTokens();
      this.currentUser.set(null);
      void this.router.navigateByUrl(redirectTo);
    };

    if (!refreshToken) return finish();

    // Best effort: the local session is cleared whether or not the server answers.
    this.http
      .post(`${this.base}/logout`, { refreshToken })
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      )
      .subscribe(finish);
  }

  private applySession(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    this.currentUser.set(response.user);
    this.initialised.set(true);
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}
