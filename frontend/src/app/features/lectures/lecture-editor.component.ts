import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { LecturesService } from '../../core/services/lectures.service';
import { LectureBankService } from '../../core/services/lecture-bank.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  ASSET_RULES,
  Lecture,
  LectureAssetKind,
} from '../../core/models/lecture.model';
import { Section } from '../../core/models/lecture-bank.model';
import { QuizEditorComponent } from './quiz-editor.component';
import { CoAuthorsComponent } from './co-authors.component';

/**
 * Everything about one lecture that its author can change, including the files.
 *
 * Uploads go from here straight to storage; the API only issues the link and
 * then confirms the object arrived. A failure leaves the rest of the form
 * untouched and the previous file in place, so "try that again" really is just
 * that — which is the whole reason the old file is not deleted until the new
 * one is confirmed.
 */
@Component({
  selector: 'el-lecture-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    QuizEditorComponent,
    CoAuthorsComponent,
  ],
  templateUrl: './lecture-editor.component.html',
  styleUrl: './lecture-editor.component.scss',
})
export class LectureEditorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(LecturesService);
  private readonly bank = inject(LectureBankService);
  private readonly notify = inject(NotificationService);

  readonly rules = ASSET_RULES;
  /** Typed here rather than inline in the template, where it would be string[]. */
  readonly kinds: LectureAssetKind[] = ['presentation', 'video', 'tile'];

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly lecture = signal<Lecture | null>(null);
  readonly sections = signal<Section[]>([]);

  /** The form's own copy, so a failed save does not half-update the screen. */
  readonly title = signal('');
  readonly objectives = signal('');
  readonly keywords = signal('');
  readonly subsectionId = signal('');
  readonly openToAll = signal(true);

  /** Upload in flight: which file, and how far along. */
  readonly uploading = signal<LectureAssetKind | null>(null);
  readonly progress = signal(0);
  /** The bytes are up and the server is turning the deck into a PDF. */
  readonly converting = signal(false);

  readonly isPublished = computed(() => this.lecture()?.status === 'published');
  readonly hasPresentation = computed(() =>
    (this.lecture()?.assets ?? []).some((a) => a.kind === 'presentation'),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);

    this.bank.sections().subscribe({
      next: (sections) => this.sections.set(sections),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not load the shelves'),
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (lecture) => {
        this.apply(lecture);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not open that lecture');
      },
    });
  }

  private apply(lecture: Lecture): void {
    this.lecture.set(lecture);
    this.title.set(lecture.title);
    this.objectives.set(lecture.objectives ?? '');
    this.keywords.set(lecture.keywords.join(', '));
    this.subsectionId.set(lecture.subsectionId);
    this.openToAll.set(lecture.visibility === 'all_institutions');
  }

  assetOf(kind: LectureAssetKind) {
    return (this.lecture()?.assets ?? []).find((asset) => asset.kind === kind);
  }

  save(): void {
    const lecture = this.lecture();
    if (!lecture || this.saving()) return;

    this.saving.set(true);
    this.api
      .update(lecture.id, {
        title: this.title().trim(),
        objectives: this.objectives().trim() || null,
        keywords: this.keywords()
          .split(',')
          .map((word) => word.trim())
          .filter(Boolean),
        subsectionId: this.subsectionId(),
        visibility: this.openToAll() ? 'all_institutions' : 'own_institution',
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.apply(updated);
          this.notify.success('Saved');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notify.showHttpError(error, 'Could not save that');
        },
      });
  }

  /** Hand the lecture to whoever actually wrote it. */
  changeAuthor(authorId: string): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.update(lecture.id, { authorId }).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.notify.success(
          `${updated.authorName ?? 'They'} is now the author`,
        );
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not change the author'),
    });
  }

  pick(kind: LectureAssetKind, input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Clearing it means picking the same file twice in a row still fires a
    // change event, which is how somebody retries after a failed upload.
    input.value = '';
    if (!file) return;

    this.uploading.set(kind);
    this.progress.set(0);
    this.converting.set(false);

    const lecture = this.lecture();
    if (!lecture) return;

    this.api.upload(lecture.id, kind, file).subscribe({
      next: (event) => {
        if ('progress' in event) {
          this.progress.set(event.progress);
          return;
        }
        if ('converting' in event) {
          this.progress.set(100);
          this.converting.set(true);
          return;
        }
        this.clearUpload();
        this.apply(event.lecture);

        const asset = event.lecture.assets.find((a) => a.kind === kind);
        if (asset?.conversionStatus === 'failed') {
          // The upload itself worked — it is the conversion that did not, and
          // the deck is still there to try again with.
          this.notify.error(
            asset.conversionError ?? 'The deck could not be turned into a PDF',
          );
        } else {
          this.notify.success(`${file.name} uploaded`);
        }
      },
      error: (error: unknown) => {
        this.clearUpload();
        this.notify.showHttpError(error, `Could not upload ${file.name}`);
      },
    });
  }

  private clearUpload(): void {
    this.uploading.set(null);
    this.progress.set(0);
    this.converting.set(false);
  }

  retryConversion(kind: LectureAssetKind): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.converting.set(true);
    this.api.retryConversion(lecture.id, kind).subscribe({
      next: (updated) => {
        this.converting.set(false);
        this.apply(updated);

        const asset = updated.assets.find((a) => a.kind === kind);
        if (asset?.conversionStatus === 'failed') {
          this.notify.error(
            asset.conversionError ?? 'It failed again',
          );
        } else {
          this.notify.success('Converted');
        }
      },
      error: (error: unknown) => {
        this.converting.set(false);
        this.notify.showHttpError(error, 'Could not convert that deck');
      },
    });
  }

  /** Download the deck as it was uploaded, rather than the PDF made from it. */
  downloadOriginal(kind: LectureAssetKind): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.originalUrl(lecture.id, kind).subscribe({
      next: ({ url }) => window.open(url, '_blank', 'noopener'),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not fetch that file'),
    });
  }

  removeFile(kind: LectureAssetKind): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.removeFile(lecture.id, kind).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.notify.info('File removed');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not remove that file'),
    });
  }

  publish(): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.publish(lecture.id).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.notify.success('Published — learners can see it now');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not publish that lecture'),
    });
  }

  unpublish(): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.unpublish(lecture.id).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.notify.info('Back to a draft — learners no longer see it');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not unpublish that lecture'),
    });
  }

  remove(): void {
    const lecture = this.lecture();
    if (!lecture) return;

    this.api.remove(lecture.id).subscribe({
      next: () => {
        this.notify.info(`${lecture.title} deleted`);
        void this.router.navigate(['/app/lectures/mine']);
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not delete that lecture'),
    });
  }

  sizeLabel(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${Math.round(mb)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
