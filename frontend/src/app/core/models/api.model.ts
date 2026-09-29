import { User, UserInstitution, UserRole } from './user.model';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

/** Step one. No address here on purpose — see CompleteProfilePayload. */
export interface RegisterPayload {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
}

/**
 * Step two: who they are, where to reach them, and how far along they are.
 *
 * Which of the optional fields are actually required is decided by the user type —
 * see PROFILE_FIELDS in user.model.ts, which mirrors the table the API enforces.
 */
export interface CompleteProfilePayload {
  role: Exclude<UserRole, 'super_user'>;
  /** Required of everybody: the address that survives leaving an institution. */
  personalEmail: string;
  /** Required of every user type that implies an institution. */
  email?: string;
  requestedInstitutionId?: string;
  trainingLevelId?: string;
  specialtyId?: string;
  residencyProgramId?: string;
  fellowshipProgramId?: string;
}

/** Changing institution, which is the same act as changing institutional address. */
export interface ChangeInstitutionalEmailPayload {
  email: string;
  requestedInstitutionId?: string;
}

export interface ChangeInstitutionalEmailResponse {
  user: User;
  autoValidated: boolean;
  message: string;
}

/** One institution somebody has belonged to. `endedAt` is the only thing that ends it. */
export interface Affiliation {
  id: string;
  institution: UserInstitution;
  institutionalEmail: string | null;
  emailVerified: boolean;
  startedAt: string;
  endedAt: string | null;
  isCurrent: boolean;
}

export interface CompleteProfileResponse {
  user: User;
  /** True when no human review is needed. */
  autoValidated: boolean;
  message: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * Setting a personal address returns the updated user plus, outside production, the
 * confirmation token — there is no mail transport wired up yet, so this is what makes
 * the flow testable end to end.
 */
export interface PersonalEmailResponse {
  user: User;
  devToken?: string;
}

export interface ResendPersonalEmailResponse {
  message: string;
  devToken?: string;
}

/**
 * Confirming a personal address returns only the address itself. The endpoint is
 * public — the token is the whole credential — so it deliberately does not hand back
 * the account.
 */
export interface VerifyPersonalEmailResponse {
  personalEmail: string;
  message: string;
}

/** What the admin panel needs to create another administrator. */
export interface CreateAdminPayload {
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
  personalEmail?: string;
}

export interface AdminUpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Empty string removes the personal address. */
  personalEmail?: string | null;
}

export interface RegisterResponse {
  user: User;
  /** True when the email domain matched an institution, so no review is needed. */
  autoValidated: boolean;
  message: string;
  /** Present outside production so the flow is testable without a mail server. */
  devEmailVerificationToken?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}
