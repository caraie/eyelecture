import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LectureBankService } from '../../core/services/lecture-bank.service';
import { NotificationService } from '../../core/services/notification.service';
import { BankFilter, Section } from '../../core/models/lecture-bank.model';

/**
 * The Lecture Bank as a learner meets it: the catalogue down the left, the
 * lectures on the right.
 *
 * The lectures are not here yet — EYE-2 adds them. What exists is the sidebar
 * and the filter it sets, so the list has something to plug into: `filter()`
 * already carries a section or a subsection, and the empty state says plainly
 * that nothing has been published rather than pretending to be a loading
 * spinner that never resolves.
 */
@Component({
  selector: 'el-lecture-bank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './lecture-bank.component.html',
  styleUrl: './lecture-bank.component.scss',
})
export class LectureBankComponent {
  private readonly api = inject(LectureBankService);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly sections = signal<Section[]>([]);
  readonly filter = signal<BankFilter>({ kind: 'all' });

  /** Expanded sections. The selected one is always open; the rest start closed. */
  readonly expanded = signal<Set<string>>(new Set());

  /** What the heading over the (future) lecture list says. */
  readonly heading = computed(() => {
    const current = this.filter();
    if (current.kind === 'all') return 'All lectures';

    const section = this.sections().find((s) => s.id === current.sectionId);
    if (!section) return 'All lectures';
    if (current.kind === 'section') return section.name;

    const sub = section.subsections.find((s) => s.id === current.subsectionId);
    return sub ? `${section.name} · ${sub.name}` : section.name;
  });

  readonly isFiltered = computed(() => this.filter().kind !== 'all');

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

  isExpanded(sectionId: string): boolean {
    return this.expanded().has(sectionId);
  }

  toggleExpanded(sectionId: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(sectionId)) next.add(sectionId);
      return next;
    });
  }

  /**
   * Clicking a section both selects it and opens it. Selecting without opening
   * would hide the subsections the click was probably aiming for; opening
   * without selecting would make the row look inert.
   */
  selectSection(section: Section): void {
    this.filter.set({ kind: 'section', sectionId: section.id });
    this.expanded.update((set) => new Set(set).add(section.id));
  }

  selectSubsection(sectionId: string, subsectionId: string): void {
    this.filter.set({ kind: 'subsection', sectionId, subsectionId });
  }

  showAll(): void {
    this.filter.set({ kind: 'all' });
  }

  isSectionSelected(sectionId: string): boolean {
    const current = this.filter();
    return current.kind === 'section' && current.sectionId === sectionId;
  }

  isSubsectionSelected(subsectionId: string): boolean {
    const current = this.filter();
    return current.kind === 'subsection' && current.subsectionId === subsectionId;
  }
}
