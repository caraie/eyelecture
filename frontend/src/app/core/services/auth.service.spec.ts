import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'ana@stanford.edu',
  secondaryEmail: null,
  secondaryEmailVerified: false,
  firstName: 'Ana',
  lastName: 'Perez',
  fullName: 'Ana Perez',
  role: 'student',
  status: 'active',
  validationStatus: 'validated',
  validationMethod: 'email_domain',
  validatedAt: null,
  validationNote: null,
  institution: { id: 'i1', name: 'Stanford', slug: 'stanford' },
  requestedInstitution: null,
  emailVerified: true,
  mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // logout() navigates here; without a matching route the router rejects
        // and vitest reports it as an unhandled error.
        provideRouter([{ path: 'auth/login', children: [] }]),
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('starts signed out', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.role()).toBeNull();
    expect(service.canReview()).toBe(false);
  });

  it('stores both tokens and the user on login', () => {
    service.login({ email: 'ana@stanford.edu', password: 'x' }).subscribe();

    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 900,
      user: makeUser(),
    });

    expect(service.accessToken).toBe('access-1');
    expect(service.refreshToken).toBe('refresh-1');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.email).toBe('ana@stanford.edu');
  });

  it('derives role flags from the signed-in user', () => {
    service.login({ email: 'a@b.c', password: 'x' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: makeUser({ role: 'program_director' }),
    });

    expect(service.isProgramDirector()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(service.isStudent()).toBe(false);
    // A director can open the review queue; a student cannot.
    expect(service.canReview()).toBe(true);
  });

  it('treats an admin as a reviewer too', () => {
    service.login({ email: 'a@b.c', password: 'x' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: makeUser({ role: 'admin' }),
    });

    expect(service.isAdmin()).toBe(true);
    expect(service.canReview()).toBe(true);
  });

  it('does not report a pending student as validated', () => {
    service.login({ email: 'a@b.c', password: 'x' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: makeUser({ validationStatus: 'pending', validationMethod: null }),
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isValidated()).toBe(false);
  });

  it('restores a session from a stored token', () => {
    localStorage.setItem('eyelecture.accessToken', 'stored');
    service.restoreSession().subscribe();

    http.expectOne(`${environment.apiUrl}/auth/me`).flush(makeUser());

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isReady()).toBe(true);
  });

  it('clears a token the server rejects instead of half-restoring', () => {
    localStorage.setItem('eyelecture.accessToken', 'stale');
    service.restoreSession().subscribe();

    http
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken).toBeNull();
    expect(service.isReady()).toBe(true);
  });

  it('does not call the API when there is no stored token', () => {
    service.restoreSession().subscribe();
    http.expectNone(`${environment.apiUrl}/auth/me`);
    expect(service.isReady()).toBe(true);
  });

  it('replaces both tokens when refreshing', () => {
    localStorage.setItem('eyelecture.refreshToken', 'old');
    service.refreshSession().subscribe();

    http.expectOne(`${environment.apiUrl}/auth/refresh`).flush({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    expect(service.accessToken).toBe('new-access');
    expect(service.refreshToken).toBe('new-refresh');
  });

  it('clears the local session even if the logout call fails', () => {
    localStorage.setItem('eyelecture.accessToken', 'a');
    localStorage.setItem('eyelecture.refreshToken', 'r');

    service.logout();
    http
      .expectOne(`${environment.apiUrl}/auth/logout`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.accessToken).toBeNull();
    expect(service.refreshToken).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
