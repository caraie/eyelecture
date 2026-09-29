import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/**
 * One field, for accounts that predate the personal address being required.
 *
 * Deliberately not folded into the profile screen: `authGuard` pins these accounts
 * here, so this is the only page they can reach, and the profile screen is a wall of
 * things they cannot get to yet. A single question with a reason next to it is a
 * better way to ask than a form with one enabled field in it.
 */
@Component({
  selector: 'el-personal-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <header class="head">
      <p class="el-overline">One more thing</p>
      <h2 class="el-headline">Add a personal email address</h2>
      <p class="el-lede">
        Your account is tied to
        <span class="el-hl-em">an address your institution controls</span>. When that
        mailbox is switched off — when you graduate, or move on — a personal address
        is what lets you keep the account.
      </p>
    </header>

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Personal email</mat-label>
        <input
          matInput
          type="email"
          formControlName="personalEmail"
          autocomplete="email"
          placeholder="you@gmail.com"
        />
        <mat-icon matPrefix>alternate_email</mat-icon>
        <mat-hint>
          Choose a back-up email account for password recovery purposes only
        </mat-hint>
        @if (form.controls.personalEmail.hasError('required')) {
          <mat-error>A personal email address is required</mat-error>
        } @else if (form.controls.personalEmail.hasError('email')) {
          <mat-error>That does not look like an email address</mat-error>
        }
      </mat-form-field>

      <button
        mat-flat-button
        color="primary"
        class="submit"
        type="submit"
        [disabled]="saving()"
      >
        @if (saving()) {
          <mat-spinner diameter="20" />
        } @else {
          Save and continue
        }
      </button>
    </form>

    <p class="fine">
      Not now? <button type="button" class="linklike" (click)="signOut()">Sign out</button>
    </p>
  `,
  styleUrl: './auth-forms.scss',
})
export class PersonalEmailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    personalEmail: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.auth
      .setPersonalEmail(this.form.controls.personalEmail.value.trim().toLowerCase())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success('Thanks — your account is safe now');
          void this.router.navigateByUrl('/app/dashboard');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notify.showHttpError(error, 'Could not save that address');
        },
      });
  }

  signOut(): void {
    this.auth.logout();
  }
}
