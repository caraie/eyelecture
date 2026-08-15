import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { InstitutionsService } from '../../core/services/institutions.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ROLE_LABELS } from '../../core/models/user.model';

@Component({
  selector: 'el-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, MatButtonModule, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly institutions = inject(InstitutionsService);

  readonly user = this.auth.user;
  readonly canReview = this.auth.canReview;
  readonly isAdmin = this.auth.isAdmin;

  readonly pendingCount = signal<number | null>(null);
  readonly totalUsers = signal<number | null>(null);
  readonly institutionCount = signal<number | null>(null);

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  /** A validated student sees no housekeeping banner; everyone else might. */
  readonly membershipState = computed(() => {
    const user = this.user();
    if (!user) return null;

    if (user.validationStatus === 'validated') return null;
    if (user.validationStatus === 'rejected') return 'rejected' as const;
    return 'pending' as const;
  });

  constructor() {
    // The dashboard is where people look to find out whether they got approved,
    // so it must not render a cached membership state.
    this.auth.reloadUser().subscribe();

    if (this.auth.canReview()) {
      this.users.pendingCount().subscribe({
        next: ({ count }) => this.pendingCount.set(count),
        error: () => this.pendingCount.set(0),
      });
    }

    if (this.auth.isAdmin()) {
      this.users.list({ limit: 1 }).subscribe({
        next: (page) => this.totalUsers.set(page.total),
        error: () => this.totalUsers.set(0),
      });
      this.institutions.list().subscribe({
        next: (list) => this.institutionCount.set(list.length),
        error: () => this.institutionCount.set(0),
      });
    }
  }
}
