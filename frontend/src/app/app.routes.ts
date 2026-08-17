import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  passwordChangeGuard,
  roleGuard,
} from './core/guards/auth.guard';

/**
 * Two shells: /auth/* for signed-out screens, /app/* for the product.
 * Every feature is lazy-loaded, so the login screen does not ship the admin code.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/app/dashboard' },

  {
    path: 'auth',
    loadComponent: () =>
      import('./features/auth/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        canActivate: [guestGuard],
        title: 'Sign in · EyeLecture',
        loadComponent: () =>
          import('./features/auth/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        title: 'Create an account · EyeLecture',
        loadComponent: () =>
          import('./features/auth/register.component').then((m) => m.RegisterComponent),
      },
      {
        // Not guest-guarded: the link may be opened while already signed in.
        path: 'verify-email',
        title: 'Confirm your email · EyeLecture',
        loadComponent: () =>
          import('./features/auth/verify-email.component').then(
            (m) => m.VerifyEmailComponent,
          ),
      },
    ],
  },

  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · EyeLecture',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'validation',
        canActivate: [roleGuard('admin', 'program_director')],
        title: 'Validation queue · EyeLecture',
        loadComponent: () =>
          import('./features/directory/validation-queue.component').then(
            (m) => m.ValidationQueueComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard('admin')],
        title: 'People · EyeLecture',
        loadComponent: () =>
          import('./features/admin/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'admins',
        canActivate: [roleGuard('admin')],
        title: 'Administrators · EyeLecture',
        loadComponent: () =>
          import('./features/admin/admins.component').then((m) => m.AdminsComponent),
      },
      {
        path: 'institutions',
        canActivate: [roleGuard('admin')],
        title: 'Institutions · EyeLecture',
        loadComponent: () =>
          import('./features/admin/institutions.component').then(
            (m) => m.InstitutionsComponent,
          ),
      },
      {
        path: 'change-password',
        canActivate: [passwordChangeGuard],
        title: 'Change your password · EyeLecture',
        loadComponent: () =>
          import('./features/auth/change-password.component').then(
            (m) => m.ChangePasswordComponent,
          ),
      },
      {
        path: 'profile',
        title: 'Profile · EyeLecture',
        loadComponent: () =>
          import('./features/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },
      {
        // The confirmation link for a personal address. Same component as the
        // profile, which reads the token off the query string — a separate screen
        // would only flash and redirect straight back here.
        path: 'profile/confirm-personal-email',
        title: 'Confirm your personal email · EyeLecture',
        loadComponent: () =>
          import('./features/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },
      {
        path: 'forbidden',
        title: 'No access · EyeLecture',
        loadComponent: () =>
          import('./features/misc/forbidden.component').then(
            (m) => m.ForbiddenComponent,
          ),
      },
    ],
  },

  {
    path: '**',
    title: 'Not found · EyeLecture',
    loadComponent: () =>
      import('./features/misc/not-found.component').then((m) => m.NotFoundComponent),
  },
];
