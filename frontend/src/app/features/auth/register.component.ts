import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { InstitutionsService } from '../../core/services/institutions.service';
import { NotificationService } from '../../core/services/notification.service';
import { DomainLookup, PublicInstitution } from '../../core/models/institution.model';
import { RegisterResponse } from '../../core/models/api.model';
import { environment } from '../../../environments/environment';

type SignupRole = 'student' | 'program_director';

/**
 * Validators.email fails on an empty string, which would leave an untouched optional
 * field marked invalid and block the whole form. This treats blank as "not provided".
 */
const optionalEmail: ValidatorFn = (control) =>
  String(control.value ?? '').trim() === '' ? null : Validators.email(control);

/**
 * The personal address has to differ from the main one. Checked here as well as on the
 * server so the person finds out while typing rather than after submitting.
 *
 * Reaches up to the parent group, so it only has an opinion once the control is
 * attached to the form.
 */
const differentFromPrimary: ValidatorFn = (control) => {
  const secondary = String(control.value ?? '').trim().toLowerCase();
  if (!secondary) return null;

  const primary = String(control.parent?.get('email')?.value ?? '')
    .trim()
    .toLowerCase();

  return primary && primary === secondary ? { sameAsPrimary: true } : null;
};

@Component({
  selector: 'el-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './auth-forms.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly institutionsApi = inject(InstitutionsService);
  private readonly notify = inject(NotificationService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);
  readonly role = signal<SignupRole>('student');
  readonly result = signal<RegisterResponse | null>(null);
  readonly isDev = !environment.production;

  readonly institutions = signal<PublicInstitution[]>([]);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    // Optional, so no Validators.required — but Validators.email rejects '', which
    // would make an untouched form invalid. Hence the wrapper that lets blank pass.
    secondaryEmail: ['', [optionalEmail, differentFromPrimary]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        // Mirrors the API rule: one character that is not a letter in any
        // alphabet, so an accented letter does not pass as a symbol.
        Validators.pattern(/[^\p{L}]/u),
      ],
    ],
    requestedInstitutionId: [''],
  });

  /**
   * Live answer to "will my address validate me automatically?". Debounced so we
   * are not asking the server on every keystroke.
   */
  private readonly lookup$: Observable<DomainLookup | null> =
    this.form.controls.email.valueChanges.pipe(
      debounceTime(450),
      map((email) => email.trim().toLowerCase()),
      distinctUntilChanged(),
      switchMap((email) =>
        !email.includes('@') || email.endsWith('@')
          ? of<DomainLookup | null>(null)
          : this.institutionsApi
              .lookup(email)
              .pipe(catchError(() => of<DomainLookup | null>(null))),
      ),
    );

  readonly lookup = toSignal(this.lookup$, { initialValue: null });

  /**
   * A FormControl is not a signal, so reading `.value` inside a computed() would
   * never re-run. Bridging valueChanges through toSignal is what makes the
   * checklist below actually react to typing.
   */
  private readonly passwordValue = toSignal(
    this.form.controls.password.valueChanges,
    { initialValue: '' },
  );

  readonly matchedInstitution = computed(() => this.lookup()?.institution ?? null);

  /** The manual institution picker only matters when the domain did not match. */
  readonly needsInstitutionPicker = computed(
    () => this.lookup() !== null && !this.lookup()!.matched,
  );

  readonly passwordChecks = computed(() => {
    const value = this.passwordValue();
    return [
      { label: '8+ characters', met: value.length >= 8 },
      { label: 'a number or symbol', met: /[^\p{L}]/u.test(value) },
    ];
  });

  constructor() {
    this.institutionsApi.listPublic().subscribe({
      next: (list) => this.institutions.set(list),
      // The picker is a convenience; signup still works without it.
      error: () => this.institutions.set([]),
    });

    // differentFromPrimary reads the email control, but Angular only re-runs a
    // validator when its own control changes. Without this, typing the same address
    // into the main field second leaves a stale "looks fine" on the personal one.
    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.form.controls.secondaryEmail.updateValueAndValidity({
          emitEvent: false,
        });
      });
  }

  setRole(role: SignupRole): void {
    this.role.set(role);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    const requestedInstitutionId =
      this.needsInstitutionPicker() && raw.requestedInstitutionId
        ? raw.requestedInstitutionId
        : undefined;

    const secondaryEmail = raw.secondaryEmail.trim().toLowerCase();

    this.auth
      .register({
        email: raw.email,
        password: raw.password,
        firstName: raw.firstName,
        lastName: raw.lastName,
        role: this.role(),
        // Omitted rather than sent as '' — the API treats a blank string as absent
        // too, but not sending it at all keeps the intent unambiguous.
        ...(secondaryEmail ? { secondaryEmail } : {}),
        ...(requestedInstitutionId ? { requestedInstitutionId } : {}),
      })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.result.set(response);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(
            this.notify.fromHttpError(error, 'Could not create your account'),
          );
        },
      });
  }

  /** Development shortcut: no mail server, so the token comes back in the response. */
  verificationLink(token: string): string {
    return `/auth/verify-email?token=${token}`;
  }
}
