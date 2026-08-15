/**
 * Application roles.
 *
 * ADMIN            – platform staff. Manages institutions and can validate anyone.
 * PROGRAM_DIRECTOR – runs a program inside an institution. Validates students who
 *                    could not be auto-validated by their email domain.
 * STUDENT          – end user. Either auto-validated by institution email domain
 *                    or manually validated by a program director.
 */
export enum UserRole {
  ADMIN = 'admin',
  PROGRAM_DIRECTOR = 'program_director',
  STUDENT = 'student',
}

/** Roles a visitor is allowed to pick when signing up. ADMIN is never self-serve. */
export const SELF_SIGNUP_ROLES: readonly UserRole[] = [
  UserRole.STUDENT,
  UserRole.PROGRAM_DIRECTOR,
];
