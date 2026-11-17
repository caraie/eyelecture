import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AccountBannerComponent } from './account-banner.component';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { User } from '../core/models/user.model';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    username: 'ana.perez',
    email: 'ana@einsteinmed.test',
    personalEmail: null,
    personalEmailVerified: false,
    firstName: 'Ana',
    lastName: 'Perez',
    fullName: 'Ana Perez',
    role: 'medical_student',
    status: 'active',
    validationStatus: 'validated',
    institution: { id: 'i1', name: 'Einstein College of Medicine' },
    requestedInstitution: null,
    emailVerified: true,
    mustChangePassword: false,
    needsPersonalEmail: false,
    ...overrides,
  }) as User;

describe('AccountBannerComponent', () => {
  let auth: {
    user: ReturnType<typeof signal<User | null>>;
    mustChangePassword: ReturnType<typeof signal<boolean>>;
    mustCompleteProfile: ReturnType<typeof signal<boolean>>;
    needsPersonalEmail: ReturnType<typeof signal<boolean>>;
    resendPersonalEmailVerification: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<AccountBannerComponent>;

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ??
    '';

  const shown = (): boolean =>
    (fixture.nativeElement as HTMLElement).querySelector('.banner') !== null;

  beforeEach(() => {
    auth = {
      user: signal<User | null>(makeUser()),
      mustChangePassword: signal(false),
      mustCompleteProfile: signal(false),
      needsPersonalEmail: signal(false),
      resendPersonalEmailVerification: vi.fn().mockReturnValue(of({})),
    };

    TestBed.configureTestingModule({
      imports: [AccountBannerComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: NotificationService,
          useValue: { showHttpError: vi.fn(), fromHttpError: () => 'x' },
        },
      ],
    });

    fixture = TestBed.createComponent(AccountBannerComponent);
    fixture.detectChanges();
  });

  it('shows nothing, and takes no space, when the account is settled', () => {
    expect(shown()).toBe(false);
  });

  it('shows nothing when there is no session', () => {
    auth.user.set(null);
    fixture.detectChanges();

    expect(shown()).toBe(false);
  });

  describe('an unconfirmed personal address', () => {
    beforeEach(() => {
      auth.user.set(
        makeUser({ personalEmail: 'ana@gmail.test', personalEmailVerified: false }),
      );
      fixture.detectChanges();
    });

    it('says so, and names the address', () => {
      expect(text()).toContain('Confirm your personal email address');
      expect(text()).toContain('ana@gmail.test');
    });

    it('offers to send the link again', () => {
      const button = fixture.nativeElement.querySelector('button');
      button.click();
      fixture.detectChanges();

      expect(auth.resendPersonalEmailVerification).toHaveBeenCalled();
      // Said on the banner rather than in a toast: the point of this is that
      // it is still there when you look back at it.
      expect(text()).toContain('Link sent');
    });

    it('lets them try again when sending fails', () => {
      auth.resendPersonalEmailVerification.mockReturnValue(
        throwError(() => new Error('nope')),
      );

      fixture.nativeElement.querySelector('button').click();
      fixture.detectChanges();

      expect(text()).not.toContain('Link sent');
      expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    });

    it('goes away on its own once it is confirmed', () => {
      auth.user.set(
        makeUser({ personalEmail: 'ana@gmail.test', personalEmailVerified: true }),
      );
      fixture.detectChanges();

      expect(shown()).toBe(false);
    });
  });

  describe('membership waiting on a program administrator', () => {
    it('names the institution', () => {
      auth.user.set(makeUser({ validationStatus: 'pending' }));
      fixture.detectChanges();

      expect(text()).toContain('Einstein College of Medicine');
    });

    it('falls back to the one they asked to join', () => {
      auth.user.set(
        makeUser({
          validationStatus: 'pending',
          institution: null,
          requestedInstitution: { id: 'i2', name: 'Duke University' },
        } as Partial<User>),
      );
      fixture.detectChanges();

      expect(text()).toContain('Duke University');
    });
  });

  describe('no personal address at all', () => {
    beforeEach(() => {
      auth.needsPersonalEmail.set(true);
      auth.user.set(makeUser({ personalEmail: null }));
      fixture.detectChanges();
    });

    it('asks for one, and says why it matters', () => {
      expect(text()).toContain('Add a personal email address');
      expect(text()).toContain('switched off');
    });

    it('links to the screen that adds one', () => {
      const link = fixture.nativeElement.querySelector('a[href]');
      expect(link?.getAttribute('href')).toBe('/app/personal-email');
    });

    it('takes priority over membership still being confirmed', () => {
      auth.user.set(
        makeUser({ personalEmail: null, validationStatus: 'pending' }),
      );
      fixture.detectChanges();

      expect(text()).toContain('Add a personal email address');
    });
  });

  describe('on a screen somebody is pinned to', () => {
    /**
     * Those screens are the explanation already. A banner there would be a
     * second copy of the heading being read. A missing personal address is
     * deliberately not among them any more — it nags instead of locking.
     */
    it.each([
      ['a temporary password', 'mustChangePassword'],
      ['an unfinished profile', 'mustCompleteProfile'],
    ])('stays out of the way for %s', (_label, flag) => {
      // Something that would otherwise show a banner.
      auth.user.set(makeUser({ validationStatus: 'pending' }));
      (auth[flag as 'mustChangePassword'] as ReturnType<typeof signal<boolean>>).set(
        true,
      );
      fixture.detectChanges();

      expect(shown()).toBe(false);
    });
  });
});
