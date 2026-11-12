import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Section, Subsection } from '../models/lecture-bank.model';

@Injectable({ providedIn: 'root' })
export class LectureBankService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/lecture-bank`;

  /** The whole catalogue, sections with their subsections nested. */
  sections(): Observable<Section[]> {
    return this.http.get<Section[]>(`${this.base}/sections`);
  }

  createSection(payload: {
    name: string;
    description?: string | null;
  }): Observable<Section> {
    return this.http.post<Section>(`${this.base}/sections`, payload);
  }

  updateSection(
    id: string,
    payload: { name?: string; description?: string | null },
  ): Observable<Section> {
    return this.http.patch<Section>(`${this.base}/sections/${id}`, payload);
  }

  removeSection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sections/${id}`);
  }

  /** The whole list in its new order — see the note on the server's ReorderDto. */
  reorderSections(ids: string[]): Observable<Section[]> {
    return this.http.patch<Section[]>(`${this.base}/sections/order`, { ids });
  }

  createSubsection(
    sectionId: string,
    payload: { name: string; description?: string | null },
  ): Observable<Subsection> {
    return this.http.post<Subsection>(
      `${this.base}/sections/${sectionId}/subsections`,
      payload,
    );
  }

  updateSubsection(
    id: string,
    payload: { name?: string; description?: string | null; sectionId?: string },
  ): Observable<Subsection> {
    return this.http.patch<Subsection>(`${this.base}/subsections/${id}`, payload);
  }

  removeSubsection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/subsections/${id}`);
  }

  reorderSubsections(sectionId: string, ids: string[]): Observable<Section> {
    return this.http.patch<Section>(
      `${this.base}/sections/${sectionId}/subsections/order`,
      { ids },
    );
  }
}
