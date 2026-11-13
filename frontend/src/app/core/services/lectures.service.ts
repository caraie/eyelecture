import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Lecture,
  LectureAssetKind,
  UploadTicket,
} from '../models/lecture.model';

@Injectable({ providedIn: 'root' })
export class LecturesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/lectures`;

  /** Published lectures, optionally narrowed to one shelf. */
  list(filterBy: { sectionId?: string; subsectionId?: string } = {}): Observable<Lecture[]> {
    const params: Record<string, string> = {};
    if (filterBy.subsectionId) params['subsectionId'] = filterBy.subsectionId;
    else if (filterBy.sectionId) params['sectionId'] = filterBy.sectionId;

    return this.http.get<Lecture[]>(this.base, { params });
  }

  /** Your own, drafts included. */
  mine(): Observable<Lecture[]> {
    return this.http.get<Lecture[]>(`${this.base}/mine`);
  }

  get(id: string): Observable<Lecture> {
    return this.http.get<Lecture>(`${this.base}/${id}`);
  }

  create(payload: {
    subsectionId: string;
    title: string;
    objectives?: string | null;
    keywords?: string[];
    visibility?: string;
  }): Observable<Lecture> {
    return this.http.post<Lecture>(this.base, payload);
  }

  update(
    id: string,
    payload: Partial<{
      subsectionId: string;
      title: string;
      objectives: string | null;
      keywords: string[];
      visibility: string;
    }>,
  ): Observable<Lecture> {
    return this.http.patch<Lecture>(`${this.base}/${id}`, payload);
  }

  publish(id: string): Observable<Lecture> {
    return this.http.post<Lecture>(`${this.base}/${id}/publish`, {});
  }

  unpublish(id: string): Observable<Lecture> {
    return this.http.post<Lecture>(`${this.base}/${id}/unpublish`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** A short-lived link to read one file — this is what the viewer loads. */
  fileUrl(
    id: string,
    kind: LectureAssetKind,
  ): Observable<{ url: string; contentType: string }> {
    return this.http.get<{ url: string; contentType: string }>(
      `${this.base}/${id}/files/${kind}/url`,
    );
  }

  removeFile(id: string, kind: LectureAssetKind): Observable<Lecture> {
    return this.http.delete<Lecture>(`${this.base}/${id}/files/${kind}`);
  }

  /**
   * Upload in three steps: ask the API where to put it, PUT the bytes straight
   * to storage, then have the API check the object really arrived.
   *
   * The bytes do not pass through the API on purpose — Cloud Run caps a request
   * body at 32 MiB and a lecture video is not that. Emits progress as a
   * percentage so the form can show a bar, then the updated lecture at the end.
   */
  upload(
    id: string,
    kind: LectureAssetKind,
    file: File,
  ): Observable<{ progress: number } | { lecture: Lecture }> {
    return this.http
      .post<UploadTicket>(`${this.base}/${id}/files/${kind}/upload-url`, {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      })
      .pipe(
        switchMap((ticket) =>
          this.http
            .put(ticket.url, file, {
              headers: ticket.headers,
              reportProgress: true,
              observe: 'events',
            })
            .pipe(
              filter(
                (event: HttpEvent<unknown>) =>
                  event.type === HttpEventType.UploadProgress ||
                  event.type === HttpEventType.Response,
              ),
              switchMap((event) => {
                if (event.type === HttpEventType.UploadProgress) {
                  const total = event.total ?? file.size;
                  return [
                    {
                      progress: Math.min(
                        99,
                        Math.round((event.loaded / total) * 100),
                      ),
                    },
                  ];
                }
                // The bytes are up; now the API checks the bucket and only
                // then counts the file as part of the lecture.
                return this.http
                  .post<Lecture>(`${this.base}/${id}/files/${kind}/confirm`, {})
                  .pipe(map((lecture) => ({ lecture })));
              }),
            ),
        ),
      );
  }
}
