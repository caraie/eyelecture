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
import { Institution } from '../../institutions/entities/institution.entity';
import { User } from './user.entity';

/**
 * One institution somebody has belonged to, and the address that proved it.
 *
 * Until now a user had a single `institutionId`, which said where they are and
 * silently forgot where they were. That was fine while the product only served
 * people mid-training; it stops being fine the moment a resident becomes a fellow
 * somewhere else, because the review asked that they keep access to the material of
 * every institution they have passed through. A row here is what grants that
 * access, and an ended affiliation grants it just as much as a current one.
 *
 * What this table deliberately does *not* hold is the validation decision. That
 * still lives on the user and means "the state of your current affiliation" — see
 * `User.validationStatus`. Moving it here is the right end state and is a separate
 * piece of work, because it drags the review queue and its guards with it.
 */
@Entity('user_affiliations')
@Index('UQ_user_affiliations_user_institution', ['userId', 'institutionId'], {
  unique: true,
})
export class UserAffiliation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.affiliations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  institutionId!: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution;

  /**
   * The address at that institution. Nullable because an affiliation can also be
   * granted by a reviewer to somebody who only has a personal address — that is the
   * whole point of the review queue.
   *
   * Uniqueness lives here rather than on the user: one person may hold several
   * institutional addresses, but no address belongs to two people.
   */
  @Column({ type: 'varchar', length: 320, nullable: true })
  institutionalEmail!: string | null;

  /** Cached lowercase domain, so matching an institution stays one indexed lookup. */
  @Index()
  @Column({ type: 'varchar', length: 253, nullable: true })
  emailDomain!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  /** Null while this is where they are. Set when they move on; the row stays. */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  get isCurrent(): boolean {
    return this.endedAt === null;
  }
}
