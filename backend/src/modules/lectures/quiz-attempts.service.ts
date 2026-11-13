import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Lecture } from './entities/lecture.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { QuizPhase } from './enums/quiz-phase.enum';
import { QuizAvailability } from './enums/quiz-availability.enum';
import { LecturesService } from './lectures.service';
import { LectureProgressService } from './lecture-progress.service';
import { User } from '../users/entities/user.entity';

/** What the learner sends back for one question. */
export interface AnswerChoice {
  /** Which question of the attempt, by position. */
  sortOrder: number;
  /** Which answer, by position; null clears it. */
  chosenIndex: number | null;
}

@Injectable()
export class QuizAttemptsService {
  constructor(
    @InjectRepository(QuizAttempt)
    private readonly attempts: Repository<QuizAttempt>,
    @InjectRepository(QuizAttemptAnswer)
    private readonly answers: Repository<QuizAttemptAnswer>,
    @InjectRepository(QuizQuestion)
    private readonly questions: Repository<QuizQuestion>,
    private readonly lectures: LecturesService,
    private readonly progress: LectureProgressService,
  ) {}

  /**
   * Starting a sitting.
   *
   * The questions are copied into the attempt right here, so what the learner
   * is asked cannot change under them mid-quiz, and so their history still
   * makes sense after the author rewrites the quiz.
   */
  async start(lectureId: string, learner: User): Promise<QuizAttempt> {
    // Also what refuses a draft or another institution's lecture, as a 404.
    const lecture = await this.lectures.findOneFor(lectureId, learner);

    const open = await this.openAttempt(lectureId, learner);
    if (open) {
      // One unfinished sitting at a time — otherwise "resume" is ambiguous.
      throw new ConflictException(
        'You already have a quiz in progress for this lecture',
      );
    }

    const questions = await this.questions.find({
      where: { lectureId },
      relations: { options: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    if (!questions.length) {
      throw new NotFoundException('This lecture has no quiz');
    }

    const phase = (await this.progress.hasCompleted(lectureId, learner))
      ? QuizPhase.POST
      : QuizPhase.PRE;
    this.assertPhaseIsOffered(lecture, phase);

    const attempt = await this.attempts.save(
      this.attempts.create({
        lectureId,
        userId: learner.id,
        phase,
        startedAt: new Date(),
        submittedAt: null,
        score: 0,
        total: questions.length,
        answers: questions.map((question, index) =>
          this.answers.create({
            questionId: question.id,
            sortOrder: index,
            prompt: question.prompt,
            explanation: question.explanation,
            options: [...question.options]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((option) => ({
                text: option.text,
                isCorrect: option.isCorrect,
              })),
            chosenIndex: null,
          }),
        ),
      }),
    );

    return this.findOwn(attempt.id, learner);
  }

  /** The sitting they walked away from, if there is one. */
  async resumable(lectureId: string, learner: User): Promise<QuizAttempt | null> {
    const open = await this.openAttempt(lectureId, learner);
    return open ? this.findOwn(open.id, learner) : null;
  }

  /**
   * Recording one answer as they go, so closing the laptop halfway loses
   * nothing — but the attempt still counts for nothing until it is submitted.
   */
  async answer(
    attemptId: string,
    choice: AnswerChoice,
    learner: User,
  ): Promise<QuizAttempt> {
    const attempt = await this.findOwn(attemptId, learner);
    this.assertOpen(attempt);

    const answer = attempt.answers.find(
      (row) => row.sortOrder === choice.sortOrder,
    );
    if (!answer) {
      throw new NotFoundException('That question is not part of this attempt');
    }
    if (
      choice.chosenIndex !== null &&
      (choice.chosenIndex < 0 || choice.chosenIndex >= answer.options.length)
    ) {
      throw new BadRequestException('That answer is not one of the choices');
    }

    answer.chosenIndex = choice.chosenIndex;
    await this.answers.save(answer);

    return this.findOwn(attemptId, learner);
  }

  /**
   * Marking it. The grading reads the snapshot taken when the attempt started,
   * never the live question — the two can already differ by now.
   */
  async submit(attemptId: string, learner: User): Promise<QuizAttempt> {
    const attempt = await this.findOwn(attemptId, learner);
    this.assertOpen(attempt);

    attempt.score = attempt.answers.filter(
      (answer) =>
        answer.chosenIndex !== null &&
        answer.options[answer.chosenIndex]?.isCorrect === true,
    ).length;
    attempt.total = attempt.answers.length;
    attempt.submittedAt = new Date();
    await this.attempts.save(attempt);

    return this.findOwn(attemptId, learner);
  }

  /** Walking away for good. Only an unfinished sitting can be thrown out. */
  async discard(attemptId: string, learner: User): Promise<void> {
    const attempt = await this.findOwn(attemptId, learner);
    this.assertOpen(attempt);

    await this.attempts.delete({ id: attemptId });
  }

  /**
   * Their own history, newest first. Unfinished sittings are left out: they
   * have no score, so they are not something to look back on.
   */
  async history(
    learner: User,
    filterBy: { lectureId?: string; phase?: QuizPhase } = {},
  ): Promise<QuizAttempt[]> {
    return this.attempts.find({
      where: {
        userId: learner.id,
        submittedAt: Not(IsNull()),
        ...(filterBy.lectureId ? { lectureId: filterBy.lectureId } : {}),
        ...(filterBy.phase ? { phase: filterBy.phase } : {}),
      },
      relations: { lecture: true },
      order: { submittedAt: 'DESC' },
    });
  }

  /** One past sitting, in full, to read back. */
  async review(attemptId: string, learner: User): Promise<QuizAttempt> {
    return this.findOwn(attemptId, learner);
  }

  // --- Rules ------------------------------------------------------------------

  /**
   * Nobody reads another learner's attempt — not an administrator, not the
   * lecture's author. A 404 rather than a 403: whether somebody else's attempt
   * exists is itself none of their business. Reporting for program directors
   * is a story of its own, and will have its own aggregated view.
   */
  private async findOwn(id: string, learner: User): Promise<QuizAttempt> {
    const attempt = await this.attempts.findOne({
      where: { id, userId: learner.id },
      relations: { answers: true, lecture: true },
      order: { answers: { sortOrder: 'ASC' } },
    });
    if (!attempt) throw new NotFoundException('That attempt was not found');
    return attempt;
  }

  private async openAttempt(
    lectureId: string,
    learner: User,
  ): Promise<QuizAttempt | null> {
    return this.attempts.findOne({
      where: { lectureId, userId: learner.id, submittedAt: IsNull() },
    });
  }

  private assertOpen(attempt: QuizAttempt): void {
    if (attempt.submittedAt) {
      throw new ConflictException('That attempt has already been submitted');
    }
  }

  /**
   * An author who says the quiz is for after the lecture means it, so a
   * learner who has not finished the lecture is not offered one yet.
   */
  private assertPhaseIsOffered(lecture: Lecture, phase: QuizPhase): void {
    const availability = lecture.quizAvailability;
    if (availability === QuizAvailability.BOTH) return;

    if (phase === QuizPhase.PRE && availability !== QuizAvailability.PRE) {
      throw new BadRequestException(
        'This quiz is meant for after the lecture — finish it first',
      );
    }
    if (phase === QuizPhase.POST && availability !== QuizAvailability.POST) {
      throw new BadRequestException(
        'This quiz was only meant to be taken before the lecture',
      );
    }
  }
}
