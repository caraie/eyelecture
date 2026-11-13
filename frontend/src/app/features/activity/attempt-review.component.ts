import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { QuizAttemptsService } from '../../core/services/quiz-attempts.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  QUIZ_PHASE_LABELS,
  QuizAttempt,
} from '../../core/models/lecture.model';

/**
 * One past sitting, read-only: what was asked, what they picked, what was
 * right, and why. The questions come from the attempt's own snapshot, so this
 * shows the quiz as it was that day even if the author has rewritten it since.
 */
@Component({
  selector: 'el-attempt-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './attempt-review.component.html',
  styleUrl: '../lectures/take-quiz.component.scss',
})
export class AttemptReviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(QuizAttemptsService);
  private readonly notify = inject(NotificationService);

  readonly phaseLabels = QUIZ_PHASE_LABELS;

  readonly loading = signal(true);
  readonly attempt = signal<QuizAttempt | null>(null);

  readonly percent = computed(() => {
    const attempt = this.attempt();
    if (!attempt?.total) return 0;
    return Math.round((attempt.score / attempt.total) * 100);
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.api.review(id).subscribe({
      next: (attempt) => {
        this.attempt.set(attempt);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not open that attempt');
      },
    });
  }
}
