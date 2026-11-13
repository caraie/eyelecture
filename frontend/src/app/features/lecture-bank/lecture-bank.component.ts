import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LectureBankService } from '../../core/services/lecture-bank.service';
import { LecturesService } from '../../core/services/lectures.service';
import { NotificationService } from '../../core/services/notification.service';
import { BankFilter, Section } from '../../core/models/lecture-bank.model';
import { Lecture } from '../../core/models/lecture.model';

/**
 * The Lecture Bank as a learner meets it: the catalogue down the left, the
 * lectures on the right.
 *
 * The list reloads whenever the filter changes, rather than being filtered in
 * the browser. The server already decides which lectures this person may see —
 * drafts are nobody else's business and an institution-only lecture is not
 * every institution's — so asking it again is both simpler and the only way
 * that stays true as the library grows.
 */
@Component({
  selector: 'el-lecture-bank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './lecture-bank.component.html',
  styleUrl: './lecture-bank.component.scss',
})
export class LectureBankComponent {
  private readonly api = inject(LectureBankService);
  private readonly lectureApi = inject(LecturesService);
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

  readonly lectures = signal<Lecture[]>([]);
  readonly loadingLectures = signal(true);

  /**
   * The co-authors a card may name. Outstanding invitations are left out —
   * being written to is not the same as being credited.
   */
  credited(lecture: Lecture) {
    return (lecture.coAuthors ?? []).filter((person) => !person.invited);
  }

  constructor() {
    this.load();

    // Runs once on open and again on every change of shelf.
    effect(() => {
      const current = this.filter();
      this.loadLectures(current);
    });
  }

  private loadLectures(current: BankFilter): void {
    this.loadingLectures.set(true);
    this.lectureApi
      .list({
        sectionId: current.kind === 'section' ? current.sectionId : undefined,
        subsectionId:
          current.kind === 'subsection' ? current.subsectionId : undefined,
      })
      .subscribe({
        next: (lectures) => {
          this.lectures.set(lectures);
          this.loadingLectures.set(false);
        },
        error: (error: unknown) => {
          this.loadingLectures.set(false);
          this.notify.showHttpError(error, 'Could not load the lectures');
        },
      });
  }

  hasVideo(lecture: Lecture): boolean {
    return lecture.assets.some((asset) => asset.kind === 'video');
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
