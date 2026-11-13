import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizQuestion } from './quiz-question.entity';

/** One answer a learner can pick. Exactly one option per question is correct. */
@Entity('lecture_quiz_options')
@Index('IDX_quiz_options_question', ['questionId'])
export class QuizOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => QuizQuestion, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question!: QuizQuestion;

  @Column({ type: 'text' })
  text!: string;

  /**
   * Not a unique index: "exactly one" is a rule about a set of rows, and a
   * unique index can only say "at most one true per question" — which would
   * also forbid a question being saved with none while it is being edited. The
   * service holds the rule, in one place, and refuses to save a question that
   * breaks it.
   */
  @Column({ type: 'boolean', default: false })
  isCorrect!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
