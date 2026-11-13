import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CoAuthor, Person } from '../models/lecture.model';

/** Who is credited on a lecture besides its author. */
@Injectable({ providedIn: 'root' })
export class CoAuthorsService {
  private readonly http = inject(HttpClient);

  private url(lectureId: string): string {
    return `${environment.apiUrl}/lectures/${lectureId}/co-authors`;
  }

  search(lectureId: string, q: string): Observable<Person[]> {
    return this.http.get<Person[]>(`${this.url(lectureId)}/search`, {
      params: { q },
    });
  }

  add(lectureId: string, userId: string): Observable<CoAuthor[]> {
    return this.http.post<CoAuthor[]>(this.url(lectureId), { userId });
  }

  /**
   * An address that already belongs to an account is credited outright by the
   * server and no mail goes out — which is the whole point of this route.
   */
  invite(
    lectureId: string,
    email: string,
    name?: string,
  ): Observable<CoAuthor[]> {
    return this.http.post<CoAuthor[]>(`${this.url(lectureId)}/invitations`, {
      email,
      ...(name ? { name } : {}),
    });
  }

  resend(lectureId: string, coAuthorId: string): Observable<CoAuthor[]> {
    return this.http.post<CoAuthor[]>(
      `${this.url(lectureId)}/${coAuthorId}/invitations`,
      {},
    );
  }

  remove(lectureId: string, coAuthorId: string): Observable<CoAuthor[]> {
    return this.http.delete<CoAuthor[]>(`${this.url(lectureId)}/${coAuthorId}`);
  }
}
