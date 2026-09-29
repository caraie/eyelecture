/** Mirrors the backend enums in backend/src/modules/users/enums. */

export type UserRole =
  | 'medical_student'
  | 'resident'
  | 'fellow'
  | 'attending_physician'
  | 'program_administrator'
  | 'super_user';

/** The ranks somebody may choose for themselves, in the order the form shows them. */
export const SELF_SIGNUP_ROLES: UserRole[] = [
  'medical_student',
  'resident',
  'fellow',
  'attending_physician',
  'program_administrator',
];

/** Still in training, and so vouched for by a matching email domain alone. */
export const TRAINEE_ROLES: UserRole[] = ['medical_student', 'resident', 'fellow'];

export type UserStatus =
  | 'pending_profile'
  | 'pending_email_verification'
  | 'active'
  | 'suspended';

export type ValidationStatus = 'pending' | 'validated' | 'rejected';

export type ValidationMethod = 'email_domain' | 'manual';

export interface UserInstitution {
  id: string;
  name: string;
  slug: string;
}

/** An entry from one of the reference lists, as it appears on a profile. */
export interface CatalogRef {
  id: string;
  name: string;
}

export interface User {
  id: string;
  /** What they sign in with. */
  username: string;
  /** Institutional address. Null until the profile is completed. */
  email: string | null;
  /** Recovery address. Reaches them; does not sign them in. */
  personalEmail: string | null;
  /**
   * Unverified is a normal state. Confirming it only proves somebody can read that
   * mailbox, which is what lets us write to it later.
   */
  personalEmailVerified: boolean;
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
  /** Which of these are filled in depends on the user type — see PROFILE_FIELDS. */
  trainingLevel: CatalogRef | null;
  specialty: CatalogRef | null;
  residencyProgram: CatalogRef | null;
  fellowshipProgram: CatalogRef | null;
  emailVerified: boolean;
  /** True while an admin-issued temporary password is still in place. */
  mustChangePassword: boolean;
  /**
   * True for an account made before a personal address was required. The router
   * pins them to the screen that adds one; the API refuses everything else.
   */
  needsPersonalEmail: boolean;
  createdAt: string;
}

/**
 * What the second half of signup asks, per user type. Mirrors PROFILE_FIELDS in
 * backend/src/modules/users/enums/user-role.enum.ts, which is what actually enforces
 * it — this copy exists so the form shows the same fields the API will accept.
 *
 * The two drifted apart once already: the form stopped showing the clinical block
 * while the API still demanded it, and the only symptom was a 400 that made no sense
 * from the screen.
 */
export interface ProfileFields {
  institution: boolean;
  level: boolean;
  specialty: boolean;
  programs: boolean;
}

export const PROFILE_FIELDS: Record<UserRole, ProfileFields> = {
  medical_student: {
    institution: true,
    level: false,
    specialty: false,
    programs: false,
  },
  resident: { institution: true, level: true, specialty: false, programs: false },
  fellow: { institution: true, level: false, specialty: true, programs: true },
  attending_physician: {
    institution: false,
    level: false,
    specialty: true,
    programs: true,
  },
  program_administrator: {
    institution: true,
    level: false,
    specialty: true,
    programs: true,
  },
  super_user: {
    institution: false,
    level: false,
    specialty: false,
    programs: false,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  medical_student: 'Medical student',
  resident: 'Resident',
  fellow: 'Fellow',
  attending_physician: 'Attending physician',
  program_administrator: 'Program Administrator',
  super_user: 'Super User',
};

/** One line each, for the rank picker. */
export const ROLE_BLURBS: Record<UserRole, string> = {
  medical_student: 'In medical school. Sign up with your school address.',
  resident: 'In a residency programme. Sign up with your institution address.',
  fellow: 'In a fellowship. Sign up with your institution address.',
  attending_physician: 'Practising. A personal address is fine.',
  program_administrator:
    'Runs a programme and vouches for its trainees. Needs approval.',
  super_user: 'Platform staff.',
};

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  pending: 'Pending review',
  validated: 'Validated',
  rejected: 'Rejected',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending_profile: 'Profile unfinished',
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
