import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Institution } from './institution.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A standing offer to run an institution.
 *
 * This is how the *first* program administrator at an institution gets in. Everyone
 * after them is approved locally by that first one, and trainees on a recognised
 * domain never need either — so this table stays small, and every row in it is a
 * deliberate act by platform staff.
 *
 * It holds a hashed token rather than the token itself, for the same reason sessions
 * do: a database dump should not be a pile of working links. The address is kept in
 * the clear because the whole point is to show, on the institution's row, who has
 * been asked and has not answered yet.
 */
// Both indexes are declared here as well as in the migration, and named to match it.
// Without that, `migration:generate` sees an index in the database that the model
// does not mention and writes a migration to drop it — which is exactly how a
// carefully-chosen partial index quietly disappears two releases later.
@Index('IDX_institution_invitations_tokenHash', ['tokenHash'])
@Index('UQ_institution_invitations_open', ['institutionId', 'email'], {
  unique: true,
  where: '"acceptedAt" IS NULL AND "revokedAt" IS NULL',
})
@Entity('institution_invitations')
export class InstitutionInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  institutionId!: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution;

  /** Where the link was sent. Stored lowercased, like every other address. */
  @Column({ length: 320 })
  email!: string;

  @Index()
  @Column({ length: 64 })
  tokenHash!: string;

  /** Who did the inviting. Null once that account is deleted; the row outlives them. */
  @Column({ type: 'uuid', nullable: true })
  invitedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invitedById' })
  invitedBy!: User | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /**
   * Set when the link is spent. Kept rather than deleted so the institution's row can
   * answer "who did we invite, and did they ever take it up" — which is the question
   * somebody actually asks three months later.
   */
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'acceptedByUserId' })
  acceptedBy!: User | null;

  /** Set when a super user withdraws the offer before it is taken up. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Pending means: not spent, not withdrawn, not stale. Anything else is history.
   * The same three conditions appear in the partial unique index, so a second
   * invitation to the same address is refused exactly while this is true.
   */
  get isPending(): boolean {
    return (
      this.acceptedAt === null &&
      this.revokedAt === null &&
      this.expiresAt.getTime() > Date.now()
    );
  }

  get isExpired(): boolean {
    return (
      this.acceptedAt === null &&
      this.revokedAt === null &&
      this.expiresAt.getTime() <= Date.now()
    );
  }
}
