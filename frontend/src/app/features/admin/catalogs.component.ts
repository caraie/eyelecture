import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CatalogsService } from '../../core/services/catalogs.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  CATALOG_KINDS,
  CATALOG_META,
  CatalogItem,
  CatalogKind,
} from '../../core/models/catalog.model';

/**
 * The three reference lists, side by side.
 *
 * One screen rather than three, because they are always edited in the same sitting
 * — somebody adding a fellowship program has just been told about a residency
 * program too — and because three near-identical pages in the sidebar would push
 * the things people actually visit further down.
 */
@Component({
  selector: 'el-catalogs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './catalogs.component.html',
  styleUrl: './catalogs.component.scss',
})
export class CatalogsComponent {
  private readonly api = inject(CatalogsService);
  private readonly notify = inject(NotificationService);

  readonly kinds = CATALOG_KINDS;
  readonly meta = CATALOG_META;

  readonly loading = signal(true);
  readonly items = signal<Record<CatalogKind, CatalogItem[]>>({
    specialties: [],
    residencies: [],
    fellowships: [],
  });

  /** Per-list scratch value for the "add" input. */
  readonly drafts = signal<Record<string, string>>({});
  /**
   * Whatever has a request in flight: a row id while editing one, or a catalog kind
   * while adding to that list. Ids are UUIDs, so the two can share one signal
   * without ever colliding.
   */
  readonly busyId = signal<string | null>(null);
  /** Row being renamed, and the text being typed into it. */
  readonly editingId = signal<string | null>(null);
  readonly editValue = signal('');
  /** Row waiting on a second click before it is deleted. */
  readonly confirmingDeleteId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    // Three independent requests; the screen appears once all of them land.
    let pending = this.kinds.length;
    const done = () => {
      if (--pending === 0) this.loading.set(false);
    };

    for (const kind of this.kinds) {
      this.api.list(kind).subscribe({
        next: (list) => {
          this.items.update((all) => ({ ...all, [kind]: list }));
          done();
        },
        error: (error: unknown) => {
          this.notify.showHttpError(error, `Could not load ${this.meta[kind].title}`);
          done();
        },
      });
    }
  }

  listFor(kind: CatalogKind): CatalogItem[] {
    return this.items()[kind];
  }

  activeCount(kind: CatalogKind): number {
    return this.listFor(kind).filter((item) => item.isActive).length;
  }

  // --- Add ------------------------------------------------------------------

  draftFor(kind: CatalogKind): string {
    return this.drafts()[kind] ?? '';
  }

  setDraft(kind: CatalogKind, value: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [kind]: value }));
  }

  add(kind: CatalogKind): void {
    const name = this.draftFor(kind).trim();
    if (!name || this.busyId()) return;

    this.busyId.set(kind);
    this.api.create(kind, name).subscribe({
      next: (created) => {
        this.busyId.set(null);
        this.setDraft(kind, '');
        this.items.update((all) => ({
          ...all,
          [kind]: [...all[kind], created].sort((a, b) => a.name.localeCompare(b.name)),
        }));
        this.notify.success(`${created.name} added`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, `Could not add that ${this.meta[kind].singular}`);
      },
    });
  }

  // --- Rename ---------------------------------------------------------------

  startEditing(item: CatalogItem): void {
    this.editingId.set(item.id);
    this.editValue.set(item.name);
    this.confirmingDeleteId.set(null);
  }

  cancelEditing(): void {
    this.editingId.set(null);
    this.editValue.set('');
  }

  saveName(kind: CatalogKind, item: CatalogItem): void {
    const name = this.editValue().trim();
    if (!name || name === item.name) {
      this.cancelEditing();
      return;
    }

    this.busyId.set(item.id);
    this.api.update(kind, item.id, { name }).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.cancelEditing();
        this.replace(kind, updated);
        this.notify.success(`Renamed to ${updated.name}`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not rename that entry');
      },
    });
  }

  // --- Retire / delete ------------------------------------------------------

  toggleActive(kind: CatalogKind, item: CatalogItem, isActive: boolean): void {
    this.busyId.set(item.id);
    this.api.update(kind, item.id, { isActive }).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.replace(kind, updated);
        this.notify.info(
          isActive
            ? `${updated.name} is selectable again`
            : `${updated.name} is retired — it stays on the profiles that already use it`,
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not update that entry');
      },
    });
  }

  askToDelete(item: CatalogItem): void {
    this.confirmingDeleteId.set(item.id);
    this.editingId.set(null);
  }

  cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  confirmDelete(kind: CatalogKind, item: CatalogItem): void {
    this.busyId.set(item.id);
    this.api.remove(kind, item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmingDeleteId.set(null);
        this.items.update((all) => ({
          ...all,
          [kind]: all[kind].filter((entry) => entry.id !== item.id),
        }));
        this.notify.success(`${item.name} deleted`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.confirmingDeleteId.set(null);
        this.notify.showHttpError(error, 'Could not delete that entry');
      },
    });
  }

  private replace(kind: CatalogKind, updated: CatalogItem): void {
    this.items.update((all) => ({
      ...all,
      [kind]: all[kind]
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }
}
