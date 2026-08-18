import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminUpdateUserPayload,
  CreateAdminPayload,
  PaginatedResult,
} from '../models/api.model';
import {
  User,
  UserRole,
  UserStatus,
  ValidationStatus,
} from '../models/user.model';

export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  validationStatus?: ValidationStatus;
  institutionId?: string;
}

const toParams = (query: UserQuery): HttpParams => {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  list(query: UserQuery = {}): Observable<PaginatedResult<User>> {
    return this.http.get<PaginatedResult<User>>(this.base, {
      params: toParams(query),
    });
  }

  /** Scoped server-side: directors get their institution, admins get everything. */
  pendingValidation(query: UserQuery = {}): Observable<PaginatedResult<User>> {
    return this.http.get<PaginatedResult<User>>(`${this.base}/pending-validation`, {
      params: toParams(query),
    });
  }

  pendingCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(
      `${this.base}/pending-validation/count`,
    );
  }

  get(id: string): Observable<User> {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  validate(id: string, body: { institutionId?: string; note?: string } = {}) {
    return this.http.post<User>(`${this.base}/${id}/validate`, body);
  }

  reject(id: string, reason?: string): Observable<User> {
    return this.http.post<User>(`${this.base}/${id}/reject`, { reason });
  }

  setRole(id: string, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/role`, { role });
  }

  setStatus(id: string, status: UserStatus): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/status`, { status });
  }

  /**
   * Activates an account without the confirmation email: sets it active and records
   * the address as confirmed, which is both halves of what the emailed link does.
   */
  activate(id: string): Observable<User> {
    return this.http.post<User>(`${this.base}/${id}/activate`, {});
  }

  assignInstitution(id: string, institutionId: string | null): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/institution`, {
      institutionId,
    });
  }

  updateProfile(payload: {
    firstName?: string;
    lastName?: string;
  }): Observable<User> {
    return this.http.patch<User>(`${this.base}/me`, payload);
  }

  // --- Administrator management -----------------------------------------------

  listAdmins(query: UserQuery = {}): Observable<PaginatedResult<User>> {
    return this.http.get<PaginatedResult<User>>(`${this.base}/admins`, {
      params: toParams(query),
    });
  }

  createAdmin(payload: CreateAdminPayload): Observable<User> {
    return this.http.post<User>(`${this.base}/admins`, payload);
  }

  adminUpdate(id: string, payload: AdminUpdateUserPayload): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}`, payload);
  }

  resetPassword(id: string, temporaryPassword: string): Observable<User> {
    return this.http.post<User>(`${this.base}/${id}/reset-password`, {
      temporaryPassword,
    });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
