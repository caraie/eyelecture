import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ROLE_LABELS, initialsOf } from '../../core/models/user.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'el-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StatusBadgeComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly usersApi = inject(UsersService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly saving = signal(false);

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  readonly initials = computed(() => {
    const user = this.user();
    return user ? initialsOf(user) : '';
  });

  readonly form = this.fb.nonNullable.group({
    firstName: [this.user()?.firstName ?? '', [Validators.required]],
    lastName: [this.user()?.lastName ?? '', [Validators.required]],
  });

  // --- Personal address -------------------------------------------------------

  readonly busy = signal(false);
  readonly editingSecondary = signal(false);
  /** Dev-only: without a mail server the confirmation link comes back inline. */
  readonly devConfirmToken = signal<string | null>(null);

  readonly devConfirmLink = computed(() => {
    const token = this.devConfirmToken();
    return environment.production || !token
      ? null
      : `/app/profile/confirm-personal-email?token=${token}`;
  });

  readonly secondaryForm = this.fb.nonNullable.group({
    secondaryEmail: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    // Someone may have validated this person since their token was issued, so
    // re-read the server's view rather than trusting what is cached in memory.
    this.auth.reloadUser().subscribe((user) => {
      if (user) {
        this.form.patchValue(
          { firstName: user.firstName, lastName: user.lastName },
          { emitEvent: false },
        );
      }
    });

    // Arriving from a confirmation link. The token is in the query string and the
    // route reuses this component, so the confirmation happens here.
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.confirmSecondary(token);
  }

  startEditingSecondary(): void {
    this.secondaryForm.reset({ secondaryEmail: this.user()?.secondaryEmail ?? '' });
    this.editingSecondary.set(true);
  }

  cancelEditingSecondary(): void {
    this.editingSecondary.set(false);
    this.secondaryForm.reset();
  }

  saveSecondary(): void {
    if (this.secondaryForm.invalid || this.busy()) {
      this.secondaryForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    const value = this.secondaryForm.getRawValue().secondaryEmail.trim();

    this.auth.setSecondaryEmail(value).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.editingSecondary.set(false);
        this.secondaryForm.reset();
        this.devConfirmToken.set(response.devToken ?? null);
        this.notify.success(
          `Saved. You can sign in with ${value} straight away — check it for a confirmation link.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not save that address');
      },
    });
  }

  resendConfirmation(): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.auth.resendSecondaryEmailVerification().subscribe({
      next: (response) => {
        this.busy.set(false);
        this.devConfirmToken.set(response.devToken ?? null);
        this.notify.success(response.message);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not send a confirmation link');
      },
    });
  }

  removeSecondary(): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.auth.removeSecondaryEmail().subscribe({
      next: () => {
        this.busy.set(false);
        this.editingSecondary.set(false);
        this.devConfirmToken.set(null);
        this.notify.info(
          'Personal address removed. From now on only your institution address signs you in.',
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not remove that address');
      },
    });
  }

  private confirmSecondary(token: string): void {
    this.busy.set(true);
    this.auth.verifySecondaryEmail(token).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.devConfirmToken.set(null);
        this.notify.success(`${result.secondaryEmail} is confirmed.`);
        // Drop the token from the URL so a refresh does not retry a spent link.
        void this.router.navigate(['/app/profile'], { replaceUrl: true });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not confirm that address');
        void this.router.navigate(['/app/profile'], { replaceUrl: true });
      },
    });
  }

  goToPasswordChange(): void {
    // The flag tells the guard this is a deliberate visit, not a forced one.
    void this.router.navigate(['/app/change-password'], {
      queryParams: { voluntary: 1 },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.usersApi.updateProfile(this.form.getRawValue()).subscribe({
      next: () => {
        // Re-read from the server so the shell's header updates too.
        this.auth.reloadUser().subscribe(() => {
          this.saving.set(false);
          this.notify.success('Profile updated');
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify.showHttpError(error, 'Could not save your profile');
      },
    });
  }

  signOutEverywhere(): void {
    this.auth.logout();
  }
}
