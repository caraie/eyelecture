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
 * Somebody besides the author who worked on a lecture.
 *
 * One row covers both shapes the screen shows: a colleague who already has an
 * account (`userId` set), and one who has only been written to (`email` set,
 * `userId` still null — the chip marked "Invited"). They are the same thing at
 * different stages, and keeping them in one table is what lets the invitation
 * turn into a real co-author in place when they sign up, rather than being
 * copied across and leaving two records of one person.
 *
 * Uniqueness is held by two partial indexes in the migration rather than by
 * decorators here: one person per lecture, and one live invitation per address
 * per lecture, both only while the row is neither withdrawn nor superseded.
 * TypeORM cannot express a partial index, and declaring a plain one would make
 * every `migration:generate` try to replace them.
 */
@Entity('lecture_co_authors')
@Index('IDX_lecture_co_authors_lecture', ['lectureId'])
export class LectureCoAuthor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  lectureId!: string;

  @ManyToOne(() => Lecture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lectureId' })
  lecture!: Lecture;

  /** Null while the invitation is still outstanding. */
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  /**
   * A deleted account takes its credit with it rather than leaving a nameless
   * chip on the lecture — the same choice the lecture's own author column makes.
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  /** Where the invitation went. Kept after acceptance, as a record of it. */
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  /** Optional, and only used until there is an account with a real name on it. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  invitedName!: string | null;

  /** The link's token, hashed — a database dump should not be a pile of links. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  /** Set when the author takes somebody off, instead of deleting the row. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  invitedById!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /** Still waiting: written to, not yet joined, not withdrawn, not stale. */
  get isPending(): boolean {
    return (
      this.userId === null &&
      this.acceptedAt === null &&
      this.revokedAt === null &&
      this.expiresAt !== null &&
      this.expiresAt.getTime() > Date.now()
    );
  }
}
