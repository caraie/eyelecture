import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
