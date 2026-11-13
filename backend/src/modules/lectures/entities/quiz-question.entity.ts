import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lecture } from './lecture.entity';
import { QuizOption } from './quiz-option.entity';

/**
 * One multiple-choice question on a lecture's quiz.
 *
 * There is a single set of questions per lecture, used for both the pre- and
 * the post-lecture attempt. That is the assumption the story flagged to
 * confirm, and it is the only one under which the two scores can be compared —
 * which is the whole reason for taking a quiz twice.
 */
@Entity('lecture_quiz_questions')
@Index('IDX_quiz_questions_lecture', ['lectureId'])
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  lectureId!: string;

  @ManyToOne(() => Lecture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lectureId' })
  lecture!: Lecture;

  @Column({ type: 'text' })
  prompt!: string;

  /**
   * Shown after the learner answers, not before. Optional: a question whose
   * right answer speaks for itself does not need one.
   */
  @Column({ type: 'text', nullable: true })
  explanation!: string | null;

  /**
   * An optional illustration — a fundus photograph, an OCT. Stored like any
   * other file, with the key owned by the server.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageObjectKey!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => QuizOption, (option) => option.question, { cascade: true })
  options!: QuizOption[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
