import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateInstitutionPayload,
  DomainLookup,
  Institution,
  Invitation,
  InvitationPreview,
  PublicInstitution,
  UpdateInstitutionPayload,
} from '../models/institution.model';

@Injectable({ providedIn: 'root' })
export class InstitutionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/institutions`;

  /** Open endpoint — used by the signup form before anyone is authenticated. */
  listPublic(): Observable<PublicInstitution[]> {
    return this.http.get<PublicInstitution[]>(`${this.base}/public`);
  }

  /**
   * Asks whether an email address will auto-validate. Public, so the signup form
   * can call it before anyone has an account.
   */
  lookup(email: string): Observable<DomainLookup> {
    return this.http.get<DomainLookup>(`${this.base}/lookup`, {
      params: { email },
    });
  }

  list(): Observable<Institution[]> {
    return this.http.get<Institution[]>(this.base);
  }

  get(id: string): Observable<Institution> {
    return this.http.get<Institution>(`${this.base}/${id}`);
  }

  create(payload: CreateInstitutionPayload): Observable<Institution> {
    return this.http.post<Institution>(this.base, payload);
  }

  update(id: string, payload: UpdateInstitutionPayload): Observable<Institution> {
    return this.http.patch<Institution>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addDomain(id: string, domain: string): Observable<Institution> {
    return this.http.post<Institution>(`${this.base}/${id}/domains`, { domain });
  }

  removeDomain(id: string, domainId: string): Observable<Institution> {
    return this.http.delete<Institution>(`${this.base}/${id}/domains/${domainId}`);
  }

  // --- Administrator invitations ------------------------------------------------

  invitations(id: string): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(`${this.base}/${id}/invitations`);
  }

  invite(id: string, email: string): Observable<Invitation> {
    return this.http.post<Invitation>(`${this.base}/${id}/invitations`, { email });
  }

  revokeInvitation(id: string, invitationId: string): Observable<Invitation> {
    return this.http.delete<Invitation>(
      `${this.base}/${id}/invitations/${invitationId}`,
    );
  }

  /** Public: what the link shows before anybody fills the form in. */
  previewInvitation(token: string): Observable<InvitationPreview> {
    return this.http.get<InvitationPreview>(
      `${environment.apiUrl}/auth/invitation`,
      { params: { token } },
    );
  }
}
