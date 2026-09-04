import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/** Mirrors USERNAME_PATTERN in the API, so the two agree on what is acceptable. */
const USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/** Both password fields have to agree. Checked on the group, not the control. */
const passwordsMatch = (group: AbstractControl): ValidationErrors | null =>
  group.get('password')?.value === group.get('confirmPassword')?.value
    ? null
    : { mismatch: true };

/**
 * Step one of signing up: a name, a username and a password.
 *
 * Everything else — rank, institution, addresses — is the next screen. Asking for
 * all of it at once is what made the old form long enough to abandon, and none of
 * it can be acted on until the account exists anyway.
 */
@Component({
  selector: 'el-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './auth-forms.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly submitting = signal(false);
  readonly hidePassword = signal(true);

  readonly form = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(100)]],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
          Validators.pattern(USERNAME_PATTERN),
        ],
      ],
      password: [
        '',
        [Validators.required, Validators.minLength(8), Validators.pattern(/[^\p{L}]/u)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  /** Live hints under the password field, same wording as the API's rules. */
  passwordHasLength(): boolean {
    return this.form.controls.password.value.length >= 8;
  }

  passwordHasSymbol(): boolean {
    return /[^\p{L}]/u.test(this.form.controls.password.value);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { firstName, lastName, username, password } = this.form.getRawValue();

    this.submitting.set(true);
    this.auth
      .register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        password,
      })
      .subscribe({
        // Registration signs them in, so this goes straight to the other half of
        // the form rather than back through a login screen.
        next: () => void this.router.navigateByUrl('/app/complete-profile'),
        error: (error: unknown) => {
          this.submitting.set(false);
          this.notify.showHttpError(error, 'Could not create your account');
        },
      });
  }
}
