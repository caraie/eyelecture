import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';

/**
 * What is still unfinished about this account, said wherever they happen to be.
 *
 * Only the states somebody can walk around with. A temporary password, an
 * unfinished profile and a missing personal address all pin them to one screen
 * that already explains itself — a banner there would be a second copy of the
 * heading they are reading.
 *
 * What is left are the two that quietly limit an account while letting it move:
 * a personal address nobody confirmed, and membership still waiting on a
 * program administrator. Neither said anything anywhere, so an account that
 * was not finished looked like an app with nothing in it.
 */
@Component({
  selector: 'el-account-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, MatButtonModule],
  template: `
    @if (state(); as state) {
      <aside class="banner" [class.warn]="state.tone === 'warn'" role="status">
        <mat-icon>{{ state.icon }}</mat-icon>

        <p class="msg">
          <span class="t">{{ state.title }}</span>
          <span class="s">{{ state.detail }}</span>
        </p>

        @if (state.kind === 'no-personal-email') {
          <a mat-stroked-button routerLink="/app/personal-email">
            Add one now
          </a>
        }

        @if (state.kind === 'personal-email') {
          @if (sent()) {
            <span class="done">
              <mat-icon>check</mat-icon>
              Link sent
            </span>
          } @else {
            <button
              mat-stroked-button
              type="button"
              [disabled]="sending()"
              (click)="resend()"
            >
              {{ sending() ? 'Sending…' : 'Send the link again' }}
            </button>
          }
        }
      </aside>
    }
  `,
  styleUrl: './account-banner.component.scss',
})
export class AccountBannerComponent {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  readonly sending = signal(false);
  readonly sent = signal(false);

  /**
   * Null when there is nothing to say — the common case, and it must cost no
   * vertical space at all.
   */
  readonly state = computed(() => {
    const user = this.auth.user();
    if (!user) return null;

    // Pinned to a screen of its own: that screen is the explanation.
    if (this.auth.mustChangePassword() || this.auth.mustCompleteProfile()) {
      return null;
    }

    // No longer a lock, so this is the only thing that asks. It has to carry
    // the reason, because "we need another address" on its own sounds like
    // paperwork rather than the thing that keeps the account after graduation.
    if (this.auth.needsPersonalEmail()) {
      return {
        kind: 'no-personal-email' as const,
        tone: 'warn' as const,
        icon: 'alternate_email',
        title: 'Add a personal email address',
        detail:
          'Your account is tied to an address your institution controls. A ' +
          'personal one is what keeps it when that mailbox is switched off.',
      };
    }

    if (user.personalEmail && !user.personalEmailVerified) {
      return {
        kind: 'personal-email' as const,
        tone: 'warn' as const,
        icon: 'mark_email_unread',
        title: 'Confirm your personal email address',
        detail:
          `We sent a link to ${user.personalEmail}. Until it is confirmed, ` +
          'it cannot be used to get you back into your account.',
      };
    }

    if (user.validationStatus === 'pending') {
      const where =
        user.institution?.name ??
        user.requestedInstitution?.name ??
        'your institution';
      return {
        kind: 'validation' as const,
        tone: 'info' as const,
        icon: 'hourglass_top',
        title: `Waiting for ${where} to confirm you`,
        detail:
          'A program administrator there has to vouch for you. You can keep ' +
          'using the app in the meantime.',
      };
    }

    return null;
  });

  resend(): void {
    if (this.sending()) return;

    this.sending.set(true);
    this.auth.resendPersonalEmailVerification().subscribe({
      next: () => {
        this.sending.set(false);
        // Stays said rather than becoming a toast that vanishes: the whole
        // point of this banner is that it is still there when you look.
        this.sent.set(true);
      },
      error: (error: unknown) => {
        this.sending.set(false);
        this.notify.showHttpError(error, 'Could not send that link again');
      },
    });
  }
}
