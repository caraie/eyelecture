import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CatalogItem,
  CatalogKind,
  PublicCatalogItem,
} from '../models/catalog.model';

@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalogs`;

  /** Open endpoint — the signup form reads these before anyone is authenticated. */
  listPublic(kind: CatalogKind): Observable<PublicCatalogItem[]> {
    return this.http.get<PublicCatalogItem[]>(`${this.base}/${kind}/public`);
  }

  /** Everything, retired entries included. Administrators only. */
  list(kind: CatalogKind): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(`${this.base}/${kind}`);
  }

  create(kind: CatalogKind, name: string): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(`${this.base}/${kind}`, { name });
  }

  update(
    kind: CatalogKind,
    id: string,
    payload: { name?: string; isActive?: boolean },
  ): Observable<CatalogItem> {
    return this.http.patch<CatalogItem>(`${this.base}/${kind}/${id}`, payload);
  }

  remove(kind: CatalogKind, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${kind}/${id}`);
  }
}
