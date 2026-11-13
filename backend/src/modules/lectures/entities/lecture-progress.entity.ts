import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lecture } from './lecture.entity';
import { User } from '../../users/entities/user.entity';

/**
 * How far one learner has got with one lecture.
 *
 * It exists for two reasons: the lecture cards say "In progress" or
 * "Completed", and an attempt is a pre-lecture one exactly when the learner
 * had not completed the lecture by the time they started it. Without a record
 * of that, "pre" and "post" would be the learner's own claim.
 */
@Entity('lecture_progress')
@Index('IDX_lecture_progress_user_lecture', ['userId', 'lectureId'], {
  unique: true,
})
export class LectureProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  lectureId!: string;

  @ManyToOne(() => Lecture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lectureId' })
  lecture!: Lecture;

  /** Set the first time they open it, and never moved afterwards. */
  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  /** Null until they say they are done with it. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
