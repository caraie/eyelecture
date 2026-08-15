import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  AuthTokens,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from '../models/api.model';
import { User, UserRole } from '../models/user.model';

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
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isProgramDirector = computed(() => this.role() === 'program_director');
  readonly isStudent = computed(() => this.role() === 'student');
  /** Can open the validation queue. */
  readonly canReview = computed(() => this.isAdmin() || this.isProgramDirector());
  readonly isValidated = computed(
    () => this.currentUser()?.validationStatus === 'validated',
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

  register(payload: RegisterPayload): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.base}/register`, payload);
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

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/resend-verification`, {
      email,
    });
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
