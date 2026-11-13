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
import { LectureCoAuthor } from './lecture-co-author.entity';
import { Subsection } from '../../lecture-bank/entities/subsection.entity';
import { User } from '../../users/entities/user.entity';
import { Institution } from '../../institutions/entities/institution.entity';
import { LectureAsset } from './lecture-asset.entity';
import { LectureStatus } from '../enums/lecture-status.enum';
import { LectureVisibility } from '../enums/lecture-visibility.enum';
import { QuizAvailability } from '../enums/quiz-availability.enum';
import { QuizQuestion } from './quiz-question.entity';

/**
 * A lecture: a presentation to read through, and optionally a video to watch.
 *
 * It belongs to exactly one subsection, which is what makes the Lecture Bank a
 * catalogue rather than a pile. The files themselves are rows in
 * `lecture_assets`; this table is the thing people search, filter and credit.
 */
@Entity('lectures')
@Index('IDX_lectures_subsection', ['subsectionId'])
@Index('IDX_lectures_status', ['status'])
export class Lecture {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  subsectionId!: string;

  @ManyToOne(() => Subsection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subsectionId' })
  subsection!: Subsection;

  @Column({ length: 300 })
  title!: string;

  /** Rich text from the editor, stored as HTML. Optional. */
  @Column({ type: 'text', nullable: true })
  objectives!: string | null;

  /**
   * Free tags for search. `simple-array` keeps them in one column: they are
   * never queried on their own, and a join table for a handful of words per
   * lecture is a table nobody would thank us for.
   */
  @Column({ type: 'simple-array', default: '' })
  keywords!: string[];

  /**
   * Whoever created it. Nullable and ON DELETE SET NULL, matching how the rest
   * of the app treats attribution: deleting an account must not delete the
   * lecture, it just loses the name attached to it.
   */
  @Column({ type: 'uuid', nullable: true })
  authorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorId' })
  author!: User | null;

  /**
   * The institution the lecture is offered on behalf of, captured when it is
   * created rather than read from the author later — an author who moves
   * institutions does not take their published lectures with them.
   */
  @Column({ type: 'uuid', nullable: true })
  institutionId!: string | null;

  @ManyToOne(() => Institution, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution | null;

  @Column({
    type: 'enum',
    enum: LectureVisibility,
    default: LectureVisibility.ALL_INSTITUTIONS,
  })
  visibility!: LectureVisibility;

  /** Only published lectures appear in the bank for learners. */
  @Column({ type: 'enum', enum: LectureStatus, default: LectureStatus.DRAFT })
  status!: LectureStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @OneToMany(() => LectureAsset, (asset) => asset.lecture)
  assets!: LectureAsset[];

  @OneToMany(() => QuizQuestion, (question) => question.lecture)
  questions!: QuizQuestion[];

  /**
   * When the quiz may be taken. Meaningless until there are questions — a
   * lecture with none simply has no quiz.
   */
  @Column({
    type: 'enum',
    enum: QuizAvailability,
    default: QuizAvailability.BOTH,
  })
  quizAvailability!: QuizAvailability;

  /**
   * Not a column. Filled in by the service so a card can say "5 questions"
   * without every screen loading every option of every question.
   */
  questionCount?: number;

  /**
   * Not a column either. Who else is credited, filled in by the service.
   *
   * Credit only, for now: a co-author's name goes on the lecture, but editing
   * it is still the author's and the administrators'. The story leaves that
   * open, and the narrower rule is the one that can be widened later without
   * anybody having quietly rewritten somebody else's lecture in between.
   */
  coAuthors?: LectureCoAuthor[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
