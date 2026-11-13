import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { LecturesService } from '../../core/services/lectures.service';
import { QuizAttemptsService } from '../../core/services/quiz-attempts.service';
import { NotificationService } from '../../core/services/notification.service';
import { Lecture } from '../../core/models/lecture.model';
import { SlideViewerComponent } from './slide-viewer.component';

/**
 * One lecture, as a learner reads it: the slides, and the video if there is
 * one.
 *
 * Both files are fetched as short-lived signed links rather than as paths on
 * our own domain, which is what keeps them out of reach of anyone who copies a
 * URL out of the page. The link is asked for when the tab is opened, not on
 * page load, so opening a lecture to read the objectives does not mint a video
 * link nobody uses.
 */
@Component({
  selector: 'el-lecture-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    SlideViewerComponent,
  ],
  templateUrl: './lecture-detail.component.html',
  styleUrl: './lecture-detail.component.scss',
})
export class LectureDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(LecturesService);
  private readonly attempts = inject(QuizAttemptsService);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly lecture = signal<Lecture | null>(null);
  readonly slidesUrl = signal<string | null>(null);
  readonly videoUrl = signal<string | null>(null);
  readonly completedAt = signal<string | null>(null);

  readonly hasVideo = computed(() =>
    (this.lecture()?.assets ?? []).some((asset) => asset.kind === 'video'),
  );
  readonly hasQuiz = computed(() => (this.lecture()?.questionCount ?? 0) > 0);
  readonly completed = computed(() => this.completedAt() !== null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (lecture) => {
        this.lecture.set(lecture);
        this.loading.set(false);
        this.openSlides();
        this.markStarted(id);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not open that lecture');
      },
    });
  }

  openSlides(): void {
    const lecture = this.lecture();
    if (!lecture || this.slidesUrl()) return;

    this.api.fileUrl(lecture.id, 'presentation').subscribe({
      next: ({ url }) => this.slidesUrl.set(url),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not open the presentation'),
    });
  }

  /**
   * Opening it counts as starting it. Quiet on failure: a learner reading a
   * lecture should not be interrupted because a progress note did not save.
   */
  private markStarted(lectureId: string): void {
    this.attempts.markStarted(lectureId).subscribe({
      next: (progress) => this.completedAt.set(progress.completedAt),
      error: () => undefined,
    });
  }

  /**
   * Saying they are done. This is what makes a later quiz attempt a
   * post-lecture one, which is why it is a deliberate click rather than
   * something inferred from scrolling to the last slide.
   */
  markCompleted(): void {
    const lecture = this.lecture();
    if (!lecture || this.completed()) return;

    this.attempts.markCompleted(lecture.id).subscribe({
      next: (progress) => {
        this.completedAt.set(progress.completedAt);
        this.notify.success('Marked as read');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not save that'),
    });
  }

  openVideo(): void {
    const lecture = this.lecture();
    if (!lecture || this.videoUrl() || !this.hasVideo()) return;

    this.api.fileUrl(lecture.id, 'video').subscribe({
      next: ({ url }) => this.videoUrl.set(url),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not open the video'),
    });
  }
}
