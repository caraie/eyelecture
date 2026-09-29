import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { InstitutionsService } from '../../core/services/institutions.service';
import { NotificationService } from '../../core/services/notification.service';
import { InvitationPreview } from '../../core/models/institution.model';

/** Mirrors USERNAME_PATTERN in the API, so the two agree on what is acceptable. */
const USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

const passwordsMatch = (group: AbstractControl): ValidationErrors | null =>
  group.get('password')?.value === group.get('confirmPassword')?.value
    ? null
    : { mismatch: true };

/**
 * Accepting an invitation to administer an institution.
 *
 * Registration and the profile step folded into one screen, because the link already
 * answered everything the second step normally asks: which institution, which rank,
 * and which institutional address. What is left is who they are and how to sign in.
 *
 * The invitation is looked up before anything is drawn. A form that only tells you
 * the link is dead *after* you have filled it in is the worst version of this.
 */
@Component({
  selector: 'el-accept-invitation',
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
  templateUrl: './accept-invitation.component.html',
  styleUrl: './auth-forms.scss',
})
export class AcceptInvitationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly institutions = inject(InstitutionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly checking = signal(true);
  readonly invitation = signal<InvitationPreview | null>(null);
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
      personalEmail: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [Validators.required, Validators.minLength(8), Validators.pattern(/[^\p{L}]/u)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  private readonly password = toSignal(
    this.form.controls.password.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );

  readonly passwordChecks = computed(() => {
    const value = this.password();
    return [
      { label: '8+ characters', met: value.length >= 8 },
      { label: 'a number or symbol', met: /[^\p{L}]/u.test(value) },
    ];
  });

  constructor() {
    if (!this.token) {
      this.checking.set(false);
      return;
    }

    this.institutions.previewInvitation(this.token).subscribe({
      next: (preview) => {
        this.invitation.set(preview);
        this.checking.set(false);
      },
      // Every reason the API refuses looks the same here, on purpose — it does not
      // tell the holder of a bad token which kind of bad it is, and neither should
      // this screen.
      error: () => this.checking.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    this.submitting.set(true);
    this.auth
      .acceptInvitation({
        token: this.token,
        firstName: raw.firstName.trim(),
        lastName: raw.lastName.trim(),
        username: raw.username.trim(),
        personalEmail: raw.personalEmail.trim().toLowerCase(),
        password: raw.password,
      })
      .subscribe({
        next: () => {
          // Straight in. There is no review queue and no verification mail waiting
          // for them — that is the whole point of having been invited.
          this.notify.success('You are set up. Welcome.');
          void this.router.navigateByUrl('/app/dashboard');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.notify.showHttpError(error, 'Could not set up your account');
        },
      });
  }
}
