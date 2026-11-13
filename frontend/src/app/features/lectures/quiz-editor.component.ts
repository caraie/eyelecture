import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { QuizzesService } from '../../core/services/quizzes.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  QUIZ_AVAILABILITY_LABELS,
  QUIZ_RULES,
  QuizAvailability,
  QuizQuestion,
  SaveQuestion,
} from '../../core/models/lecture.model';

/** A question being written, before it has ever reached the server. */
interface Draft {
  prompt: string;
  explanation: string;
  options: { text: string; isCorrect: boolean }[];
}

const emptyDraft = (): Draft => ({
  prompt: '',
  explanation: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ],
});

/**
 * Writing a lecture's quiz, inside the lecture editor.
 *
 * One question is open at a time. Everything is saved on its own — there is no
 * "save the quiz" button — so closing the browser halfway through loses the
 * question being typed and nothing else.
 */
@Component({
  selector: 'el-quiz-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './quiz-editor.component.html',
  styleUrl: './quiz-editor.component.scss',
})
export class QuizEditorComponent {
  private readonly api = inject(QuizzesService);
  private readonly notify = inject(NotificationService);

  readonly lectureId = input.required<string>();
  readonly availability = input.required<QuizAvailability>();

  readonly rules = QUIZ_RULES;
  readonly availabilities: QuizAvailability[] = ['pre', 'post', 'both'];
  readonly availabilityLabels = QUIZ_AVAILABILITY_LABELS;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly questions = signal<QuizQuestion[]>([]);
  readonly chosenAvailability = signal<QuizAvailability>('both');

  /** Which question is open: its id, 'new', or null for none. */
  readonly editingId = signal<string | null>(null);
  readonly draft = signal<Draft>(emptyDraft());

  readonly canAddOption = computed(
    () => this.draft().options.length < QUIZ_RULES.maxOptions,
  );
  readonly canRemoveOption = computed(
    () => this.draft().options.length > QUIZ_RULES.minOptions,
  );

  /** What is still missing, shown under the form rather than on submit. */
  readonly problem = computed<string | null>(() => {
    const draft = this.draft();
    if (!draft.prompt.trim()) return 'Write the question first';
    if (draft.options.some((option) => !option.text.trim()))
      return 'Every answer needs text';
    if (!draft.options.some((option) => option.isCorrect))
      return 'Mark the correct answer';
    return null;
  });

  constructor() {
    effect(() => {
      const id = this.lectureId();
      this.chosenAvailability.set(this.availability());
      this.load(id);
    });
  }

  private load(lectureId: string): void {
    this.loading.set(true);
    this.api.list(lectureId).subscribe({
      next: (questions) => {
        this.questions.set(questions);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load the quiz');
      },
    });
  }

  startNew(): void {
    this.draft.set(emptyDraft());
    this.editingId.set('new');
  }

  edit(question: QuizQuestion): void {
    this.draft.set({
      prompt: question.prompt,
      explanation: question.explanation ?? '',
      options: question.options.map((option) => ({
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    });
    this.editingId.set(question.id);
  }

  cancel(): void {
    this.editingId.set(null);
  }

  setPrompt(value: string): void {
    this.draft.update((draft) => ({ ...draft, prompt: value }));
  }

  setExplanation(value: string): void {
    this.draft.update((draft) => ({ ...draft, explanation: value }));
  }

  setOptionText(index: number, value: string): void {
    this.draft.update((draft) => ({
      ...draft,
      options: draft.options.map((option, i) =>
        i === index ? { ...option, text: value } : option,
      ),
    }));
  }

  /** Exactly one answer is right, so choosing one unmarks the rest. */
  setCorrect(index: number): void {
    this.draft.update((draft) => ({
      ...draft,
      options: draft.options.map((option, i) => ({
        ...option,
        isCorrect: i === index,
      })),
    }));
  }

  addOption(): void {
    if (!this.canAddOption()) return;
    this.draft.update((draft) => ({
      ...draft,
      options: [...draft.options, { text: '', isCorrect: false }],
    }));
  }

  removeOption(index: number): void {
    if (!this.canRemoveOption()) return;
    this.draft.update((draft) => {
      const options = draft.options.filter((_, i) => i !== index);
      // Dropping the right answer would leave none, so the first one takes over.
      if (!options.some((option) => option.isCorrect)) options[0].isCorrect = true;
      return { ...draft, options };
    });
  }

  saveQuestion(): void {
    const editing = this.editingId();
    if (!editing || this.problem() || this.saving()) return;

    const draft = this.draft();
    const payload: SaveQuestion = {
      prompt: draft.prompt.trim(),
      explanation: draft.explanation.trim() || null,
      options: draft.options.map((option) => ({
        text: option.text.trim(),
        isCorrect: option.isCorrect,
      })),
    };

    this.saving.set(true);
    const request =
      editing === 'new'
        ? this.api.create(this.lectureId(), payload)
        : this.api.update(this.lectureId(), editing, payload);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.editingId.set(null);
        this.questions.update((questions) =>
          editing === 'new'
            ? [...questions, saved]
            : questions.map((q) => (q.id === saved.id ? saved : q)),
        );
        this.notify.success('Question saved');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify.showHttpError(error, 'Could not save that question');
      },
    });
  }

  remove(question: QuizQuestion): void {
    this.api.remove(this.lectureId(), question.id).subscribe({
      next: () => {
        this.questions.update((questions) =>
          questions.filter((q) => q.id !== question.id),
        );
        if (this.editingId() === question.id) this.editingId.set(null);
        this.notify.info('Question removed');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not remove that question'),
    });
  }

  /** Arrows rather than dragging, like the lecture bank's reordering. */
  move(index: number, by: -1 | 1): void {
    const questions = [...this.questions()];
    const to = index + by;
    if (to < 0 || to >= questions.length) return;

    [questions[index], questions[to]] = [questions[to], questions[index]];
    const before = this.questions();
    this.questions.set(questions);

    this.api.reorder(this.lectureId(), questions.map((q) => q.id)).subscribe({
      next: (ordered) => this.questions.set(ordered),
      error: (error: unknown) => {
        // Put it back rather than leave the screen claiming an order the
        // server did not accept.
        this.questions.set(before);
        this.notify.showHttpError(error, 'Could not reorder the questions');
      },
    });
  }

  changeAvailability(availability: QuizAvailability): void {
    const before = this.chosenAvailability();
    this.chosenAvailability.set(availability);

    this.api.setAvailability(this.lectureId(), availability).subscribe({
      error: (error: unknown) => {
        this.chosenAvailability.set(before);
        this.notify.showHttpError(error, 'Could not change when the quiz runs');
      },
    });
  }

  correctAnswerOf(question: QuizQuestion): string {
    return question.options.find((option) => option.isCorrect)?.text ?? '—';
  }
}
