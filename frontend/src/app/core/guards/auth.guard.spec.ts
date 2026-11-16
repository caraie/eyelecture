import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

/**
 * These exist because of a freeze, not a failing assertion.
 *
 * The guard used to test each pending requirement against the URL in turn.
 * With two outstanding, the screen for the first failed the test for the
 * second and the router bounced between them until Chrome offered to kill the
 * tab — so an account on a temporary password with no personal address, which
 * is every account an administrator creates, could not sign in at all.
 */
describe('authGuard', () => {
  let auth: {
    isAuthenticated: Mock;
    mustChangePassword: Mock;
    mustCompleteProfile: Mock;
    needsPersonalEmail: Mock;
  };

  const run = (url: string): boolean | UrlTree =>
    TestBed.runInInjectionContext(() =>
      authGuard(
        {} as ActivatedRouteSnapshot,
        { url } as RouterStateSnapshot,
      ),
    ) as boolean | UrlTree;

  /** Where the guard sent us, or null when it let the navigation through. */
  const sentTo = (url: string): string | null => {
    const result = run(url);
    if (result === true) return null;
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  };

  beforeEach(() => {
    auth = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      mustChangePassword: vi.fn().mockReturnValue(false),
      mustCompleteProfile: vi.fn().mockReturnValue(false),
      needsPersonalEmail: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('lets a settled account through', () => {
    expect(sentTo('/app/dashboard')).toBeNull();
  });

  it('sends somebody with no session to sign in', () => {
    auth.isAuthenticated.mockReturnValue(false);

    expect(sentTo('/app/dashboard')).toContain('/auth/login');
  });

  describe('with one requirement outstanding', () => {
    it('pins a temporary password to the change-password screen', () => {
      auth.mustChangePassword.mockReturnValue(true);

      expect(sentTo('/app/dashboard')).toBe('/app/change-password');
    });

    it('pins an unfinished profile to the profile screen', () => {
      auth.mustCompleteProfile.mockReturnValue(true);

      expect(sentTo('/app/dashboard')).toBe('/app/complete-profile');
    });

    it('pins a missing personal address to its own screen', () => {
      auth.needsPersonalEmail.mockReturnValue(true);

      expect(sentTo('/app/dashboard')).toBe('/app/personal-email');
    });

    it('leaves them alone once they are on the right screen', () => {
      auth.mustChangePassword.mockReturnValue(true);

      expect(sentTo('/app/change-password')).toBeNull();
    });
  });

  describe('with two outstanding — the case that froze the tab', () => {
    beforeEach(() => {
      auth.mustChangePassword.mockReturnValue(true);
      auth.needsPersonalEmail.mockReturnValue(true);
    });

    it('sends them to the password screen first', () => {
      expect(sentTo('/app/dashboard')).toBe('/app/change-password');
    });

    it('does not then send them away from it', () => {
      expect(sentTo('/app/change-password')).toBeNull();
    });

    it('moves on to the address only once the password is replaced', () => {
      auth.mustChangePassword.mockReturnValue(false);

      expect(sentTo('/app/change-password')).toBe('/app/personal-email');
      expect(sentTo('/app/personal-email')).toBeNull();
    });
  });

  describe('with all three outstanding', () => {
    beforeEach(() => {
      auth.mustChangePassword.mockReturnValue(true);
      auth.mustCompleteProfile.mockReturnValue(true);
      auth.needsPersonalEmail.mockReturnValue(true);
    });

    it('settles on one screen and stays there', () => {
      expect(sentTo('/app/dashboard')).toBe('/app/change-password');
      expect(sentTo('/app/change-password')).toBeNull();
    });

    /**
     * The property that actually matters: whatever the guard asks for, asking
     * again from there has to be a fixed point. A pair that disagreed is what
     * the loop was.
     */
    it('never redirects away from a screen it just chose', () => {
      for (const flags of [
        [true, true, true],
        [true, true, false],
        [true, false, true],
        [false, true, true],
        [true, false, false],
        [false, true, false],
        [false, false, true],
      ]) {
        auth.mustChangePassword.mockReturnValue(flags[0]);
        auth.mustCompleteProfile.mockReturnValue(flags[1]);
        auth.needsPersonalEmail.mockReturnValue(flags[2]);

        const first = sentTo('/app/dashboard');
        expect(first).not.toBeNull();
        expect(sentTo(first as string)).toBeNull();
      }
    });
  });
});
