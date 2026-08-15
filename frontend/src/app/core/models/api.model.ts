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
  role?: Exclude<UserRole, 'admin'>;
  requestedInstitutionId?: string;
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
