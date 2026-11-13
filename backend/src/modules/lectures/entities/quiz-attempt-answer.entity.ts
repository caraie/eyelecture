import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizAttempt } from './quiz-attempt.entity';

/** One answer as it looked when the question was asked. */
export interface AnsweredOption {
  text: string;
  isCorrect: boolean;
}

/**
 * One question of one attempt, kept as a copy rather than a reference.
 *
 * The author may rewrite the question, swap its answers or delete it outright
 * the day after a learner sat the quiz. If this row pointed at the live
 * question, the learner's own history would silently change underneath them —
 * and a past score would stop adding up. So the wording, the answers and which
 * one was right are written down here at the moment the attempt starts.
 *
 * `questionId` is kept as well, but only to line up the two attempts on the
 * same question in the pre/post comparison; nothing is read through it.
 */
@Entity('quiz_attempt_answers')
@Index('IDX_quiz_attempt_answers_attempt', ['attemptId', 'sortOrder'])
export class QuizAttemptAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  attemptId!: string;

  @ManyToOne(() => QuizAttempt, (attempt) => attempt.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attemptId' })
  attempt!: QuizAttempt;

  /** Null once the question it came from has been deleted. */
  @Column({ type: 'uuid', nullable: true })
  questionId!: string | null;

  @Column({ type: 'int' })
  sortOrder!: number;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'text', nullable: true })
  explanation!: string | null;

  @Column({ type: 'jsonb' })
  options!: AnsweredOption[];

  /** Which one they picked, by position. Null means they left it blank. */
  @Column({ type: 'int', nullable: true })
  chosenIndex!: number | null;
}
