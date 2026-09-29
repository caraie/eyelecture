import { Routes } from '@angular/router';
import {
  authGuard,
  completeProfileGuard,
  personalEmailGuard,
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
        // Guest-guarded like registration: this link creates an account, and
        // somebody already signed in has one.
        path: 'invitation',
        canActivate: [guestGuard],
        title: 'Your invitation · EyeLecture',
        loadComponent: () =>
          import('./features/auth/accept-invitation.component').then(
            (m) => m.AcceptInvitationComponent,
          ),
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
        canActivate: [roleGuard('super_user', 'program_administrator')],
        title: 'Validation queue · EyeLecture',
        loadComponent: () =>
          import('./features/directory/validation-queue.component').then(
            (m) => m.ValidationQueueComponent,
          ),
      },
      {
        path: 'users',
        // A program administrator gets the same screen, scoped by the server to
        // their own institution. The row actions it offers are already gated on
        // super user, so widening the route does not widen what they can do.
        canActivate: [roleGuard('super_user', 'program_administrator')],
        title: 'People · EyeLecture',
        loadComponent: () =>
          import('./features/admin/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'admins',
        canActivate: [roleGuard('super_user')],
        title: 'Super Users · EyeLecture',
        loadComponent: () =>
          import('./features/admin/admins.component').then((m) => m.AdminsComponent),
      },
      {
        path: 'institutions',
        canActivate: [roleGuard('super_user')],
        title: 'Institutions · EyeLecture',
        loadComponent: () =>
          import('./features/admin/institutions.component').then(
            (m) => m.InstitutionsComponent,
          ),
      },
      {
        path: 'catalogs',
        canActivate: [roleGuard('super_user')],
        title: 'Reference lists · EyeLecture',
        loadComponent: () =>
          import('./features/admin/catalogs.component').then(
            (m) => m.CatalogsComponent,
          ),
      },
      {
        path: 'complete-profile',
        canActivate: [completeProfileGuard],
        title: 'Complete your profile · EyeLecture',
        loadComponent: () =>
          import('./features/auth/complete-profile.component').then(
            (m) => m.CompleteProfileComponent,
          ),
      },
      {
        path: 'personal-email',
        canActivate: [personalEmailGuard],
        title: 'Add a personal email · EyeLecture',
        loadComponent: () =>
          import('./features/auth/personal-email.component').then(
            (m) => m.PersonalEmailComponent,
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
