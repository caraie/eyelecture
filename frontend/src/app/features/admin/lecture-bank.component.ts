import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LectureBankService } from '../../core/services/lecture-bank.service';
import { NotificationService } from '../../core/services/notification.service';
import { Section, Subsection } from '../../core/models/lecture-bank.model';

/**
 * The shelves of the Lecture Bank: sections, and the subsections inside them.
 *
 * Reordering is by up/down buttons rather than drag and drop. Drag is nicer with
 * a mouse and unusable without one, and this list is edited rarely and read
 * constantly — the keyboard-reachable version is the one worth having first.
 * Each move sends the whole list, which is what the API asks for.
 */
@Component({
  selector: 'el-lecture-bank-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './lecture-bank.component.html',
  styleUrl: './lecture-bank.component.scss',
})
export class LectureBankAdminComponent {
  private readonly api = inject(LectureBankService);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly sections = signal<Section[]>([]);

  /** Draft for the "add section" field, and one per section for its subsections. */
  readonly sectionDraft = signal('');
  readonly subsectionDrafts = signal<Record<string, string>>({});

  /** Whatever has a request in flight. Ids are UUIDs, so one signal is enough. */
  readonly busyId = signal<string | null>(null);
  /** The row being renamed, and the text in it. */
  readonly editingId = signal<string | null>(null);
  readonly editValue = signal('');
  /** Sections the admin has collapsed. Expanded is the default. */
  readonly collapsed = signal<Set<string>>(new Set());

  readonly subsectionTotal = computed(() =>
    this.sections().reduce((sum, section) => sum + section.subsections.length, 0),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.sections().subscribe({
      next: (sections) => {
        this.sections.set(sections);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load the lecture bank');
      },
    });
  }

  isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  toggleCollapsed(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // --- Add ------------------------------------------------------------------

  addSection(): void {
    const name = this.sectionDraft().trim();
    if (!name || this.busyId()) return;

    this.busyId.set('new-section');
    this.api.createSection({ name }).subscribe({
      next: (section) => {
        this.busyId.set(null);
        this.sectionDraft.set('');
        this.sections.update((all) => [...all, { ...section, subsections: [] }]);
        this.notify.success(`${section.name} added`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not add that section');
      },
    });
  }

  subsectionDraft(sectionId: string): string {
    return this.subsectionDrafts()[sectionId] ?? '';
  }

  setSubsectionDraft(sectionId: string, value: string): void {
    this.subsectionDrafts.update((drafts) => ({ ...drafts, [sectionId]: value }));
  }

  addSubsection(section: Section): void {
    const name = this.subsectionDraft(section.id).trim();
    if (!name || this.busyId()) return;

    this.busyId.set(`new-${section.id}`);
    this.api.createSubsection(section.id, { name }).subscribe({
      next: (subsection) => {
        this.busyId.set(null);
        this.setSubsectionDraft(section.id, '');
        this.sections.update((all) =>
          all.map((s) =>
            s.id === section.id
              ? { ...s, subsections: [...s.subsections, subsection] }
              : s,
          ),
        );
        this.notify.success(`${subsection.name} added to ${section.name}`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not add that subsection');
      },
    });
  }

  // --- Rename ---------------------------------------------------------------

  startEditing(row: Section | Subsection): void {
    this.editingId.set(row.id);
    this.editValue.set(row.name);
  }

  cancelEditing(): void {
    this.editingId.set(null);
    this.editValue.set('');
  }

  saveSectionName(section: Section): void {
    const name = this.editValue().trim();
    if (!name || name === section.name) return this.cancelEditing();

    this.busyId.set(section.id);
    this.api.updateSection(section.id, { name }).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.cancelEditing();
        this.sections.update((all) =>
          all.map((s) => (s.id === section.id ? { ...s, name: updated.name } : s)),
        );
        this.notify.success(`Renamed to ${updated.name}`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not rename that section');
      },
    });
  }

  saveSubsectionName(section: Section, subsection: Subsection): void {
    const name = this.editValue().trim();
    if (!name || name === subsection.name) return this.cancelEditing();

    this.busyId.set(subsection.id);
    this.api.updateSubsection(subsection.id, { name }).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.cancelEditing();
        this.sections.update((all) =>
          all.map((s) =>
            s.id === section.id
              ? {
                  ...s,
                  subsections: s.subsections.map((sub) =>
                    sub.id === subsection.id ? { ...sub, name: updated.name } : sub,
                  ),
                }
              : s,
          ),
        );
        this.notify.success(`Renamed to ${updated.name}`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not rename that subsection');
      },
    });
  }

  // --- Reorder --------------------------------------------------------------

  moveSection(index: number, delta: number): void {
    const current = this.sections();
    const target = index + delta;
    if (target < 0 || target >= current.length || this.busyId()) return;

    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    // Shown moved straight away; the server's answer replaces it either way, and
    // a failure puts the old order back.
    this.sections.set(reordered);
    this.busyId.set('order');
    this.api.reorderSections(reordered.map((s) => s.id)).subscribe({
      next: (sections) => {
        this.busyId.set(null);
        this.sections.set(sections);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.sections.set(current);
        this.notify.showHttpError(error, 'Could not reorder the sections');
      },
    });
  }

  moveSubsection(section: Section, index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= section.subsections.length || this.busyId()) return;

    const previous = this.sections();
    const reordered = [...section.subsections];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    this.sections.update((all) =>
      all.map((s) => (s.id === section.id ? { ...s, subsections: reordered } : s)),
    );
    this.busyId.set(`order-${section.id}`);
    this.api
      .reorderSubsections(
        section.id,
        reordered.map((s) => s.id),
      )
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          this.sections.update((all) =>
            all.map((s) => (s.id === updated.id ? updated : s)),
          );
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.sections.set(previous);
          this.notify.showHttpError(error, 'Could not reorder the subsections');
        },
      });
  }

  // --- Delete ---------------------------------------------------------------

  /**
   * No second-click confirmation here, unlike the reference lists: the server
   * refuses to delete anything that still holds something, and says what has to
   * move first. An empty shelf is cheap to lose and cheap to recreate.
   */
  deleteSection(section: Section): void {
    if (this.busyId()) return;

    this.busyId.set(section.id);
    this.api.removeSection(section.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.sections.update((all) => all.filter((s) => s.id !== section.id));
        this.notify.info(`${section.name} deleted`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not delete that section');
      },
    });
  }

  deleteSubsection(section: Section, subsection: Subsection): void {
    if (this.busyId()) return;

    this.busyId.set(subsection.id);
    this.api.removeSubsection(subsection.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.sections.update((all) =>
          all.map((s) =>
            s.id === section.id
              ? {
                  ...s,
                  subsections: s.subsections.filter((x) => x.id !== subsection.id),
                }
              : s,
          ),
        );
        this.notify.info(`${subsection.name} deleted`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not delete that subsection');
      },
    });
  }
}
