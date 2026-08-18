import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { UsersService } from '../core/services/users.service';
import { EyeLogoComponent } from '../shared/components/eye-logo.component';
import { ROLE_LABELS, initialsOf } from '../core/models/user.model';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Shows the pending-review count next to the link. */
  badge?: boolean;
}

@Component({
  selector: 'el-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    EyeLogoComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  readonly theme = inject(ThemeService);

  readonly user = this.auth.user;
  readonly pendingCount = signal(0);
  readonly navOpen = signal(false);

  /**
   * On a temporary password, so the only reachable screen is change-password.
   *
   * The navigation is hidden rather than disabled. Every link here is refused by
   * `authGuard` and the API refuses the requests behind them too, so showing them
   * offers a way in that does not exist — and the resulting nothing-happens reads as
   * a broken app rather than as a locked one. Goes back on its own the moment the
   * password is replaced, because this is derived from the session.
   */
  readonly locked = this.auth.mustChangePassword;

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  readonly initials = computed(() => {
    const user = this.user();
    return user ? initialsOf(user) : '';
  });

  readonly navGroups = computed<{ title: string; items: NavItem[] }[]>(() => {
    const groups: { title: string; items: NavItem[] }[] = [
      {
        title: 'Overview',
        items: [{ label: 'Dashboard', icon: 'dashboard', route: '/app/dashboard' }],
      },
    ];

    if (this.auth.canReview()) {
      groups.push({
        title: 'People',
        items: [
          {
            label: 'Validation queue',
            icon: 'how_to_reg',
            route: '/app/validation',
            badge: true,
          },
        ],
      });
    }

    if (this.auth.isAdmin()) {
      groups[groups.length - 1].items.push({
        label: 'All users',
        icon: 'group',
        route: '/app/users',
      });
      groups.push({
        title: 'Administration',
        items: [
          { label: 'Institutions', icon: 'school', route: '/app/institutions' },
          {
            label: 'Administrators',
            icon: 'admin_panel_settings',
            route: '/app/admins',
          },
        ],
      });
    }

    groups.push({
      title: 'Account',
      items: [{ label: 'Profile', icon: 'person', route: '/app/profile' }],
    });

    return groups;
  });

  constructor() {
    // Not while locked: the API refuses everything but /me, change-password and
    // logout, so this would only produce a failed request behind a hidden badge.
    if (this.auth.canReview() && !this.locked()) this.refreshPendingCount();
  }

  refreshPendingCount(): void {
    this.users.pendingCount().subscribe({
      next: ({ count }) => this.pendingCount.set(count),
      // A failing badge count must never block the shell from rendering.
      error: () => this.pendingCount.set(0),
    });
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
  }
}
