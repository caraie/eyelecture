import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { QuizAttemptsService } from '../../core/services/quiz-attempts.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  QUIZ_PHASE_LABELS,
  QuizAttemptSummary,
  QuizPhase,
} from '../../core/models/lecture.model';

/** One lecture's line in the comparison: best pre score against best post. */
interface Comparison {
  lectureId: string;
  lectureTitle: string;
  pre: number | null;
  post: number | null;
  attempts: number;
}

/**
 * Everything the learner has done: every quiz they have submitted, and what
 * the pre- and post-lecture scores add up to per lecture.
 *
 * Only their own — there is no view here of anybody else's results, and no API
 * call that would return one.
 */
@Component({
  selector: 'el-my-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './my-activity.component.html',
  styleUrl: './my-activity.component.scss',
})
export class MyActivityComponent {
  private readonly api = inject(QuizAttemptsService);
  private readonly notify = inject(NotificationService);

  readonly phaseLabels = QUIZ_PHASE_LABELS;
  readonly phases: QuizPhase[] = ['pre', 'post'];

  readonly loading = signal(true);
  readonly attempts = signal<QuizAttemptSummary[]>([]);

  /** Filters applied here rather than refetching — the history is one list. */
  readonly lectureFilter = signal<string>('');
  readonly phaseFilter = signal<QuizPhase | ''>('');
  readonly newestFirst = signal(true);

  readonly lectures = computed(() => {
    const seen = new Map<string, string>();
    for (const attempt of this.attempts()) {
      seen.set(attempt.lectureId, attempt.lectureTitle ?? 'Untitled lecture');
    }
    return [...seen].map(([id, title]) => ({ id, title }));
  });

  readonly shown = computed(() => {
    const lectureId = this.lectureFilter();
    const phase = this.phaseFilter();

    const rows = this.attempts().filter(
      (attempt) =>
        (!lectureId || attempt.lectureId === lectureId) &&
        (!phase || attempt.phase === phase),
    );

    const direction = this.newestFirst() ? -1 : 1;
    return rows.sort(
      (a, b) =>
        direction *
        (new Date(b.submittedAt ?? 0).getTime() -
          new Date(a.submittedAt ?? 0).getTime()),
    );
  });

  /**
   * Per lecture, the best pre score against the best post score.
   *
   * Best rather than latest: with unlimited attempts, the latest may be a
   * half-hearted retry, and what the learner wants to see is how far they got.
   */
  readonly comparisons = computed<Comparison[]>(() => {
    const byLecture = new Map<string, Comparison>();

    for (const attempt of this.attempts()) {
      if (!attempt.total) continue;

      const row = byLecture.get(attempt.lectureId) ?? {
        lectureId: attempt.lectureId,
        lectureTitle: attempt.lectureTitle ?? 'Untitled lecture',
        pre: null,
        post: null,
        attempts: 0,
      };
      row.attempts += 1;

      const percent = Math.round((attempt.score / attempt.total) * 100);
      if (attempt.phase === 'pre') {
        row.pre = Math.max(row.pre ?? 0, percent);
      } else {
        row.post = Math.max(row.post ?? 0, percent);
      }
      byLecture.set(attempt.lectureId, row);
    }

    // A lecture taken only once has nothing to compare, so it is left out.
    return [...byLecture.values()].filter(
      (row) => row.pre !== null && row.post !== null,
    );
  });

  constructor() {
    this.api.history().subscribe({
      next: (attempts) => {
        this.attempts.set(attempts);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load your activity');
      },
    });
  }

  percent(attempt: QuizAttemptSummary): number {
    return attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
  }

  gain(row: Comparison): number {
    return (row.post ?? 0) - (row.pre ?? 0);
  }
}
