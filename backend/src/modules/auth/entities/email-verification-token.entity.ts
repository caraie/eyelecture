import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VerificationPurpose } from '../enums/verification-purpose.enum';

/** Single-use token emailed to the user to confirm they own the address. */
@Entity('email_verification_tokens')
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 64 })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /**
   * Which address this token confirms. Checked on redemption, so a token issued for
   * the personal address cannot be spent to verify the institutional one.
   */
  @Column({
    type: 'enum',
    enum: VerificationPurpose,
    default: VerificationPurpose.PRIMARY_EMAIL,
  })
  purpose!: VerificationPurpose;

  /**
   * The address the token was sent to, as it stood when it was issued. If the person
   * changes their personal address before clicking, the old link is stale rather
   * than quietly confirming the new one.
   */
  @Column({ type: 'varchar', length: 320, nullable: true })
  targetEmail!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
