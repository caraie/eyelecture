import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { QuizAttemptsService } from '../../core/services/quiz-attempts.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  QUIZ_PHASE_LABELS,
  QuizAttempt,
} from '../../core/models/lecture.model';

/**
 * Sitting a lecture's quiz: one question at a time, answers saved as they go.
 *
 * Leaving before submitting costs nothing — the attempt stays open and
 * unscored, and coming back offers to resume it or throw it away. Until it is
 * submitted it is not in the history at all.
 */
@Component({
  selector: 'el-take-quiz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LowerCasePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatRadioModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './take-quiz.component.html',
  styleUrl: './take-quiz.component.scss',
})
export class TakeQuizComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(QuizAttemptsService);
  private readonly notify = inject(NotificationService);

  readonly phaseLabels = QUIZ_PHASE_LABELS;

  readonly lectureId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly attempt = signal<QuizAttempt | null>(null);
  readonly index = signal(0);

  /** Set when an unfinished sitting is waiting — resume it or throw it away. */
  readonly resuming = signal(false);
  /** Set when they press Submit with questions still blank. */
  readonly confirmingBlanks = signal(false);

  readonly done = computed(() => this.attempt()?.submittedAt !== null);
  readonly questions = computed(() => this.attempt()?.questions ?? []);
  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly answered = computed(
    () => this.questions().filter((q) => q.chosenIndex !== null).length,
  );
  readonly blanks = computed(() => this.questions().length - this.answered());
  readonly progress = computed(() => {
    const total = this.questions().length;
    return total ? Math.round((this.answered() / total) * 100) : 0;
  });
  readonly isLast = computed(
    () => this.index() === this.questions().length - 1,
  );
  readonly percent = computed(() => {
    const attempt = this.attempt();
    if (!attempt?.total) return 0;
    return Math.round((attempt.score / attempt.total) * 100);
  });

  constructor() {
    this.api.open(this.lectureId).subscribe({
      next: (open) => {
        this.loading.set(false);
        if (open) {
          this.attempt.set(open);
          this.resuming.set(true);
        } else {
          this.begin();
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not open that quiz');
      },
    });
  }

  private begin(): void {
    this.busy.set(true);
    this.api.start(this.lectureId).subscribe({
      next: (attempt) => {
        this.busy.set(false);
        this.attempt.set(attempt);
        this.index.set(0);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not start that quiz');
        void this.router.navigate(['/app/lectures', this.lectureId]);
      },
    });
  }

  resume(): void {
    this.resuming.set(false);
    // Pick up at the first question they have not answered.
    const next = this.questions().findIndex((q) => q.chosenIndex === null);
    this.index.set(next === -1 ? 0 : next);
  }

  startOver(): void {
    const attempt = this.attempt();
    if (!attempt) return;

    this.api.discard(attempt.id).subscribe({
      next: () => {
        this.resuming.set(false);
        this.attempt.set(null);
        this.begin();
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not discard that attempt'),
    });
  }

  choose(chosenIndex: number): void {
    const attempt = this.attempt();
    const question = this.current();
    if (!attempt || !question || this.done()) return;

    this.api.answer(attempt.id, question.sortOrder, chosenIndex).subscribe({
      next: (updated) => this.attempt.set(updated),
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not record that answer'),
    });
  }

  go(by: -1 | 1): void {
    const to = this.index() + by;
    if (to < 0 || to >= this.questions().length) return;
    this.index.set(to);
  }

  goTo(index: number): void {
    this.index.set(index);
    this.confirmingBlanks.set(false);
  }

  /** Submitting with blanks asks once; pressing again goes through. */
  trySubmit(): void {
    if (this.blanks() > 0 && !this.confirmingBlanks()) {
      this.confirmingBlanks.set(true);
      return;
    }
    this.submit();
  }

  private submit(): void {
    const attempt = this.attempt();
    if (!attempt || this.busy()) return;

    this.busy.set(true);
    this.confirmingBlanks.set(false);
    this.api.submit(attempt.id).subscribe({
      next: (marked) => {
        this.busy.set(false);
        this.attempt.set(marked);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not submit that quiz');
      },
    });
  }
}
