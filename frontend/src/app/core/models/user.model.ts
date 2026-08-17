/** Mirrors the backend enums in backend/src/modules/users/enums. */

export type UserRole = 'admin' | 'program_director' | 'student';

export type UserStatus = 'pending_email_verification' | 'active' | 'suspended';

export type ValidationStatus = 'pending' | 'validated' | 'rejected';

export type ValidationMethod = 'email_domain' | 'manual';

export interface UserInstitution {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  /** Optional personal address. Signs the user in just like `email` does. */
  secondaryEmail: string | null;
  /**
   * Unverified is a normal, usable state — sign-in works either way. It only means
   * nobody has proven they can read that mailbox yet.
   */
  secondaryEmailVerified: boolean;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  validationStatus: ValidationStatus;
  validationMethod: ValidationMethod | null;
  validatedAt: string | null;
  validationNote: string | null;
  institution: UserInstitution | null;
  requestedInstitution: UserInstitution | null;
  emailVerified: boolean;
  /** True while an admin-issued temporary password is still in place. */
  mustChangePassword: boolean;
  createdAt: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  program_director: 'Program director',
  student: 'Student',
};

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  pending: 'Pending review',
  validated: 'Validated',
  rejected: 'Rejected',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending_email_verification: 'Email not verified',
  active: 'Active',
  suspended: 'Suspended',
};

/** Maps a validation status onto the design system's badge variants. */
export const VALIDATION_BADGE: Record<ValidationStatus, string> = {
  pending: 'el-badge-warning',
  validated: 'el-badge-success',
  rejected: 'el-badge-error',
};

export const initialsOf = (user: Pick<User, 'firstName' | 'lastName'>): string =>
  `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
