import { User, UserRole } from './user.model';

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

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Optional personal address, outside the institution. */
  secondaryEmail?: string;
  role?: Exclude<UserRole, 'admin'>;
  requestedInstitutionId?: string;
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
export interface SecondaryEmailResponse {
  user: User;
  devToken?: string;
}

export interface ResendSecondaryEmailResponse {
  message: string;
  devToken?: string;
}

/**
 * Confirming a personal address returns only the address itself. The endpoint is
 * public — the token is the whole credential — so it deliberately does not hand back
 * the account.
 */
export interface VerifySecondaryEmailResponse {
  secondaryEmail: string;
  message: string;
}

/** What the admin panel needs to create another administrator. */
export interface CreateAdminPayload {
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
  secondaryEmail?: string;
}

export interface AdminUpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Empty string removes the personal address. */
  secondaryEmail?: string | null;
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
  email: string;
  password: string;
}
