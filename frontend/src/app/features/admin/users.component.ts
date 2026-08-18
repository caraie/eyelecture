import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UsersService, UserQuery } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  User,
  UserRole,
  UserStatus,
  initialsOf,
} from '../../core/models/user.model';

@Component({
  selector: 'el-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    StatusBadgeComponent,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  private readonly api = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly people = signal<User[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);

  readonly search = signal('');
  readonly roleFilter = signal<UserRole | ''>('');
  readonly statusFilter = signal<UserStatus | ''>('');

  readonly roleLabels = ROLE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly roles: UserRole[] = ['admin', 'program_director', 'student'];
  readonly statuses: UserStatus[] = [
    'active',
    'pending_email_verification',
    'suspended',
  ];

  /** Guards the UI against actions the API would reject anyway. */
  readonly currentUserId = this.auth.user()?.id ?? '';

  /** Row waiting on a second click before it is actually deleted. */
  readonly confirmingDeleteId = signal<string | null>(null);
  /** Row with a delete in flight. Only deletes need this — they cannot be undone. */
  readonly deletingId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  initials(user: User): string {
    return initialsOf(user);
  }

  load(): void {
    this.loading.set(true);

    const query: UserQuery = {
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
      ...(this.search() ? { search: this.search() } : {}),
      ...(this.roleFilter() ? { role: this.roleFilter() as UserRole } : {}),
      ...(this.statusFilter() ? { status: this.statusFilter() as UserStatus } : {}),
    };

    this.api.list(query).subscribe({
      next: (page) => {
        this.people.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load users');
      },
    });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  setRole(user: User, role: UserRole): void {
    if (role === user.role) return;

    this.api.setRole(user.id, role).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.notify.success(`${updated.fullName} is now a ${ROLE_LABELS[role]}`);
      },
      error: (error: unknown) => this.notify.showHttpError(error),
    });
  }

  setStatus(user: User, status: UserStatus): void {
    if (status === user.status) return;

    this.api.setStatus(user.id, status).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.notify.info(`${updated.fullName}: ${STATUS_LABELS[status].toLowerCase()}`);
      },
      error: (error: unknown) => this.notify.showHttpError(error),
    });
  }

  /**
   * Stands in for the confirmation email while no mail provider is wired up. Also
   * marks the address confirmed, so the person is not left with a banner asking them
   * to click a link that was never sent.
   */
  activate(user: User): void {
    this.api.activate(user.id).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.notify.success(`${updated.fullName} can now sign in`);
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not activate that account'),
    });
  }

  // --- Delete -------------------------------------------------------------------

  /**
   * Two-step rather than a modal, matching the administrators screen: the row turns
   * into its own confirmation, so the name stays on screen next to the question.
   * A dialog would cover the table and ask about somebody you can no longer see.
   */
  askToDelete(user: User): void {
    this.confirmingDeleteId.set(user.id);
  }

  cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  confirmDelete(user: User): void {
    if (this.deletingId()) return;

    this.deletingId.set(user.id);
    this.api.remove(user.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.confirmingDeleteId.set(null);
        // Dropped locally rather than refetched. A reload would pull a row up from
        // the next page and shift everything under the cursor, right after a
        // destructive click — the last moment to move the ground under someone.
        this.people.update((list) => list.filter((item) => item.id !== user.id));
        this.total.update((value) => Math.max(0, value - 1));
        this.notify.success(`${user.fullName} no longer has an account`);
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.confirmingDeleteId.set(null);
        this.notify.showHttpError(error, 'Could not delete that account');
      },
    });
  }

  private replace(updated: User): void {
    this.people.update((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
}
