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
import { QuizAttemptAnswer } from './quiz-attempt-answer.entity';
import { User } from '../../users/entities/user.entity';
import { QuizPhase } from '../enums/quiz-phase.enum';

/**
 * One sitting of one lecture's quiz by one learner.
 *
 * Unlimited attempts, so there is no uniqueness here — the history is the
 * point. An attempt with no `submittedAt` was abandoned or is still open: it
 * counts for nothing and the learner may resume or discard it.
 */
@Entity('quiz_attempts')
@Index('IDX_quiz_attempts_user', ['userId', 'startedAt'])
@Index('IDX_quiz_attempts_lecture', ['lectureId'])
export class QuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  lectureId!: string;

  /**
   * Deleting a lecture takes its attempts with it. The alternative — keeping
   * them pointing at nothing — would leave a history of scores on a lecture
   * nobody can open, which helps no one.
   */
  @ManyToOne(() => Lecture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lectureId' })
  lecture!: Lecture;

  @Column({ type: 'enum', enum: QuizPhase })
  phase!: QuizPhase;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** Both only meaningful once submitted; until then they are zero. */
  @Column({ type: 'int', default: 0 })
  score!: number;

  @Column({ type: 'int', default: 0 })
  total!: number;

  @OneToMany(() => QuizAttemptAnswer, (answer) => answer.attempt, {
    cascade: true,
  })
  answers!: QuizAttemptAnswer[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
