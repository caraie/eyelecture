import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UsersService } from '../../core/services/users.service';
import { InstitutionsService } from '../../core/services/institutions.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { User, ROLE_LABELS, initialsOf } from '../../core/models/user.model';
import { Institution } from '../../core/models/institution.model';
import {
  ReviewDecisionDialog,
  ReviewDialogData,
  ReviewDialogResult,
} from './review-decision.dialog';

@Component({
  selector: 'el-validation-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './validation-queue.component.html',
  styleUrl: './validation-queue.component.scss',
})
export class ValidationQueueComponent {
  private readonly usersApi = inject(UsersService);
  private readonly institutionsApi = inject(InstitutionsService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly people = signal<User[]>([]);
  readonly total = signal(0);
  readonly search = signal('');
  /** Ids currently being acted on, so their row can show a spinner. */
  readonly busy = signal<Set<string>>(new Set());

  readonly isAdmin = this.auth.isAdmin;
  readonly institutions = signal<Institution[]>([]);
  readonly reviewerInstitution = computed(
    () => this.auth.user()?.institution?.name ?? null,
  );

  readonly roleLabels = ROLE_LABELS;

  constructor() {
    this.load();

    // Admins may need to attach a person to an institution while approving them.
    if (this.auth.isAdmin()) {
      this.institutionsApi.list().subscribe({
        next: (list) => this.institutions.set(list),
        error: () => this.institutions.set([]),
      });
    }
  }

  initials(user: User): string {
    return initialsOf(user);
  }

  isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  load(): void {
    this.loading.set(true);
    this.usersApi
      .pendingValidation({ limit: 50, search: this.search() || undefined })
      .subscribe({
        next: (page) => {
          this.people.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.notify.showHttpError(error, 'Could not load the queue');
        },
      });
  }

  applySearch(): void {
    this.load();
  }

  /**
   * Approving needs a target institution. A director always has one implicitly;
   * an admin looking at an unaffiliated signup has to choose, so both cases go
   * through the same dialog rather than one silently guessing.
   */
  approve(user: User): void {
    const needsInstitution =
      this.isAdmin() && !user.institution && !user.requestedInstitution;

    const data: ReviewDialogData = {
      mode: 'approve',
      user,
      institutions: this.institutions(),
      requireInstitution: needsInstitution,
    };

    this.dialog
      .open(ReviewDecisionDialog, { data, width: '460px' })
      .afterClosed()
      .subscribe((result?: ReviewDialogResult) => {
        if (!result) return;
        this.runDecision(user, () =>
          this.usersApi.validate(user.id, {
            ...(result.institutionId ? { institutionId: result.institutionId } : {}),
            ...(result.note ? { note: result.note } : {}),
          }),
          `${user.fullName} is now validated`,
        );
      });
  }

  reject(user: User): void {
    const data: ReviewDialogData = {
      mode: 'reject',
      user,
      institutions: [],
      requireInstitution: false,
    };

    this.dialog
      .open(ReviewDecisionDialog, { data, width: '460px' })
      .afterClosed()
      .subscribe((result?: ReviewDialogResult) => {
        if (!result) return;
        this.runDecision(
          user,
          () => this.usersApi.reject(user.id, result.note),
          `${user.fullName}'s request was turned down`,
        );
      });
  }

  private runDecision(
    user: User,
    action: () => { subscribe: (o: object) => unknown },
    successMessage: string,
  ): void {
    this.busy.update((set) => new Set(set).add(user.id));

    (action() as ReturnType<UsersService['validate']>).subscribe({
      next: () => {
        // Drop the row locally instead of refetching: the decision is final and
        // the list is short, so a full reload would just make the UI flicker.
        this.people.update((list) => list.filter((p) => p.id !== user.id));
        this.total.update((value) => Math.max(0, value - 1));
        this.clearBusy(user.id);
        this.notify.success(successMessage);
      },
      error: (error: unknown) => {
        this.clearBusy(user.id);
        this.notify.showHttpError(error, 'That did not go through');
      },
    });
  }

  private clearBusy(id: string): void {
    this.busy.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }
}
