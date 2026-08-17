import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/**
 * Two situations, one screen:
 *
 *   - forced, because an admin created the account with a temporary password. The
 *     guard pins the user here and the API refuses everything else, so the copy has
 *     to explain why rather than look like an interruption.
 *   - voluntary, from the profile.
 *
 * `mustChangePassword` is what tells them apart, so nothing needs to be passed in.
 */
@Component({
  selector: 'el-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly forced = this.auth.mustChangePassword;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hideCurrent = signal(true);
  readonly hideNew = signal(true);

  readonly form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        // Mirrors the API rule — one character that is not a letter in any alphabet.
        Validators.pattern(/[^\p{L}]/u),
      ],
    ],
    confirmPassword: ['', [Validators.required]],
  });

  private readonly newValue = toSignal(
    this.form.controls.newPassword.valueChanges,
    { initialValue: '' },
  );
  private readonly confirmValue = toSignal(
    this.form.controls.confirmPassword.valueChanges,
    { initialValue: '' },
  );

  readonly passwordChecks = computed(() => {
    const value = this.newValue();
    return [
      { label: '8+ characters', met: value.length >= 8 },
      { label: 'a number or symbol', met: /[^\p{L}]/u.test(value) },
    ];
  });

  /**
   * Only complains once there is something to compare. Flagging a mismatch while the
   * confirmation field is still half-typed is noise.
   */
  readonly mismatch = computed(() => {
    const confirm = this.confirmValue();
    return confirm.length > 0 && confirm !== this.newValue();
  });

  submit(): void {
    if (this.form.invalid || this.mismatch() || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();

    this.auth
      .changePassword({
        currentPassword: raw.currentPassword,
        newPassword: raw.newPassword,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.notify.success(
            'Password updated. Other devices have been signed out.',
          );
          void this.router.navigateByUrl('/app/dashboard');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(
            this.notify.fromHttpError(error, 'Could not change your password'),
          );
        },
      });
  }

  signOut(): void {
    this.auth.logout();
  }
}
