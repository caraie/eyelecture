import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LecturesService } from '../../core/services/lectures.service';
import { LectureBankService } from '../../core/services/lecture-bank.service';
import { NotificationService } from '../../core/services/notification.service';
import { Lecture } from '../../core/models/lecture.model';
import { Section } from '../../core/models/lecture-bank.model';

/**
 * Everything this author has written, drafts included, and the one form that
 * starts a new one.
 *
 * Creating asks for only a shelf and a title. Everything else — the files, the
 * objectives, the keywords — happens on the lecture's own page, because a
 * lecture is mostly its presentation and a form that asks for a 200 MB upload
 * before it will save anything is a form people lose work to.
 */
@Component({
  selector: 'el-my-lectures',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './my-lectures.component.html',
  styleUrl: './my-lectures.component.scss',
})
export class MyLecturesComponent {
  private readonly api = inject(LecturesService);
  private readonly bank = inject(LectureBankService);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly lectures = signal<Lecture[]>([]);
  readonly sections = signal<Section[]>([]);

  readonly title = signal('');
  readonly subsectionId = signal('');
  readonly creating = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.bank.sections().subscribe({
      next: (sections) => this.sections.set(sections),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not load the shelves'),
    });

    this.api.mine().subscribe({
      next: (lectures) => {
        this.lectures.set(lectures);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load your lectures');
      },
    });
  }

  create(): void {
    const title = this.title().trim();
    const subsectionId = this.subsectionId();
    if (!title || !subsectionId || this.creating()) return;

    this.creating.set(true);
    this.api.create({ subsectionId, title }).subscribe({
      next: (lecture) => {
        this.creating.set(false);
        this.title.set('');
        this.lectures.update((all) => [lecture, ...all]);
        this.notify.success(`${lecture.title} created as a draft`);
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.notify.showHttpError(error, 'Could not create that lecture');
      },
    });
  }

  /** "Glaucoma · Angle closure", for the row under each title. */
  shelfOf(lecture: Lecture): string {
    for (const section of this.sections()) {
      const sub = section.subsections.find((s) => s.id === lecture.subsectionId);
      if (sub) return `${section.name} · ${sub.name}`;
    }
    return '';
  }

  hasFile(lecture: Lecture, kind: 'presentation' | 'video'): boolean {
    return lecture.assets.some((asset) => asset.kind === kind);
  }
}
