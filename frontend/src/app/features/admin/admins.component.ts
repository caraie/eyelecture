import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { User, initialsOf } from '../../core/models/user.model';

/**
 * Optional email field: blank is fine, anything else has to be a real address.
 * Validators.email alone rejects '', which would block a form nobody filled in.
 */
const optionalEmail: ValidatorFn = (control) =>
  String(control.value ?? '').trim() === '' ? null : Validators.email(control);

/**
 * Suggests something long and random, so nobody reaches for "Admin1234".
 *
 * Alphabet omits look-alike characters (l/1/I, O/0) because this password gets read
 * off a screen and typed by hand at least once.
 */
const PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

const suggestPassword = (): string => {
  const draw = (length: number): string => {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(
      values,
      (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length],
    ).join('');
  };

  // The API insists on at least one non-letter, and a random draw might be all
  // letters. Redraw rather than appending a fixed character — a suggestion that
  // always ended in the same digit would be a pattern worth not having.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = draw(18);
    if (/[^\p{L}]/u.test(candidate)) return candidate;
  }

  // 18 all-letter draws in a row is vanishingly unlikely, but the loop needs an
  // exit that still satisfies the rule.
  return `${draw(17)}7`;
};

@Component({
  selector: 'el-admins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './admins.component.html',
  styleUrl: './admins.component.scss',
})
export class AdminsComponent {
  private readonly api = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly admins = signal<User[]>([]);
  readonly showCreate = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  /** Id awaiting a second click before it is actually deleted. */
  readonly confirmingDeleteId = signal<string | null>(null);

  /**
   * The temporary password of the admin just created. Held only in memory and only
   * until the panel is closed — there is no mail transport, so this is the one chance
   * to copy it, and it must not be recoverable afterwards.
   */
  readonly issuedCredentials = signal<{ email: string; password: string } | null>(
    null,
  );

  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  readonly createForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    secondaryEmail: ['', [optionalEmail]],
    temporaryPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/[^\p{L}]/u),
      ],
    ],
  });

  readonly editForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    secondaryEmail: ['', [optionalEmail]],
  });

  constructor() {
    this.load();
  }

  initials(user: User): string {
    return initialsOf(user);
  }

  isSelf(user: User): boolean {
    return user.id === this.currentUserId();
  }

  load(): void {
    this.loading.set(true);
    // limit 100 is the API ceiling. An installation with more administrators than
    // that needs paging here, but it would be a strange installation.
    this.api.listAdmins({ page: 1, limit: 100 }).subscribe({
      next: (page) => {
        this.admins.set(page.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load administrators');
      },
    });
  }

  // --- Create -----------------------------------------------------------------

  toggleCreate(): void {
    this.showCreate.update((open) => !open);
    if (this.showCreate()) {
      this.createForm.reset();
      this.createForm.patchValue({ temporaryPassword: suggestPassword() });
      this.issuedCredentials.set(null);
    }
  }

  regeneratePassword(): void {
    this.createForm.patchValue({ temporaryPassword: suggestPassword() });
  }

  create(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const secondaryEmail = raw.secondaryEmail.trim().toLowerCase();

    this.saving.set(true);
    this.api
      .createAdmin({
        email: raw.email.trim().toLowerCase(),
        firstName: raw.firstName.trim(),
        lastName: raw.lastName.trim(),
        temporaryPassword: raw.temporaryPassword,
        ...(secondaryEmail ? { secondaryEmail } : {}),
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.admins.update((list) =>
            [created, ...list].sort((a, b) =>
              a.fullName.localeCompare(b.fullName),
            ),
          );
          this.issuedCredentials.set({
            email: created.email,
            password: raw.temporaryPassword,
          });
          this.createForm.reset();
          this.showCreate.set(false);
          this.notify.success(`${created.fullName} can now sign in as an administrator`);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notify.showHttpError(error, 'Could not create the administrator');
        },
      });
  }

  async copyCredentials(): Promise<void> {
    const issued = this.issuedCredentials();
    if (!issued) return;

    try {
      await navigator.clipboard.writeText(
        `EyeLecture administrator access\nEmail: ${issued.email}\nTemporary password: ${issued.password}\n\nYou will be asked to choose your own password when you sign in.`,
      );
      this.notify.success('Copied. Send it over a channel you trust.');
    } catch {
      // Clipboard access needs a secure context and can be blocked outright. The
      // credentials are on screen either way, so this is a nudge, not a failure.
      this.notify.info('Could not reach the clipboard — copy it from the panel.');
    }
  }

  dismissCredentials(): void {
    this.issuedCredentials.set(null);
  }

  // --- Edit -------------------------------------------------------------------

  startEditing(user: User): void {
    this.editingId.set(user.id);
    this.confirmingDeleteId.set(null);
    this.editForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      secondaryEmail: user.secondaryEmail ?? '',
    });
  }

  cancelEditing(): void {
    this.editingId.set(null);
    this.editForm.reset();
  }

  saveEdit(user: User): void {
    if (this.editForm.invalid || this.busyId()) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();
    const secondaryEmail = raw.secondaryEmail.trim().toLowerCase();

    this.busyId.set(user.id);
    this.api
      .adminUpdate(user.id, {
        firstName: raw.firstName.trim(),
        lastName: raw.lastName.trim(),
        email: raw.email.trim().toLowerCase(),
        // '' is meaningful here: it clears the address. undefined would leave it be,
        // so the two cases cannot be collapsed.
        secondaryEmail,
      })
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          this.replace(updated);
          this.editingId.set(null);
          this.notify.success(`${updated.fullName} updated`);

          // Editing your own row changes what the shell shows about you.
          if (this.isSelf(updated)) this.auth.reloadUser().subscribe();
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.notify.showHttpError(error, 'Could not save those changes');
        },
      });
  }

  // --- Reset password ---------------------------------------------------------

  resetPassword(user: User): void {
    if (this.busyId()) return;

    const password = suggestPassword();
    this.busyId.set(user.id);

    this.api.resetPassword(user.id, password).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.replace(updated);
        this.issuedCredentials.set({ email: updated.email, password });
        this.notify.info(
          `${updated.fullName} will have to set a new password at their next sign-in.`,
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not reset that password');
      },
    });
  }

  // --- Delete -----------------------------------------------------------------

  /**
   * Two-step rather than a confirm dialog: the row itself turns into the
   * confirmation, which keeps what is being deleted visible while it is asked about.
   */
  askToDelete(user: User): void {
    this.confirmingDeleteId.set(user.id);
    this.editingId.set(null);
  }

  cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  confirmDelete(user: User): void {
    if (this.busyId()) return;

    this.busyId.set(user.id);
    this.api.remove(user.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmingDeleteId.set(null);
        this.admins.update((list) => list.filter((item) => item.id !== user.id));
        this.notify.success(`${user.fullName} no longer has an account`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.confirmingDeleteId.set(null);
        this.notify.showHttpError(error, 'Could not delete that account');
      },
    });
  }

  private replace(updated: User): void {
    this.admins.update((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
}
