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
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../enums/validation-status.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Always stored lowercased and trimmed — see UsersService.normalizeEmail. */
  @Index({ unique: true })
  @Column({ length: 320 })
  email!: string;

  /** Cached lowercase domain part of the email. Lets us match institutions cheaply. */
  @Index()
  @Column({ length: 253 })
  emailDomain!: string;

  /**
   * Optional personal address, deliberately outside any institution — a place to
   * reach someone after they graduate and their university mailbox is switched off.
   * Either address signs them in.
   *
   * Unique like `email`, and checked against `email` too, so one person's personal
   * address can never collide with another's institutional one. In Postgres a unique
   * index still permits many NULLs, which is what makes the column optional.
   *
   * Institution membership is decided by `email` alone. This address never grants it.
   */
  // Partial, matching the migration exactly. A plain `@Index({ unique: true })` would
  // read as equivalent — Postgres permits repeated NULLs either way — but the next
  // `migration:generate` would then want to add a second, non-partial index.
  @Index('UQ_users_secondaryEmail', {
    unique: true,
    where: '"secondaryEmail" IS NOT NULL',
  })
  @Column({ type: 'varchar', length: 320, nullable: true })
  secondaryEmail!: string | null;

  /**
   * Unverified is a normal, usable state, not a blocked one: the address works for
   * sign-in right away and the person can confirm it later from their profile. It
   * only gates things we would rather not send to an address nobody has proven.
   */
  @Column({ type: 'timestamptz', nullable: true })
  secondaryEmailVerifiedAt!: Date | null;

  /** bcrypt hash. Never selected unless explicitly asked for. */
  @Column({ select: false })
  passwordHash!: string;

  /**
   * Set when an admin creates the account with a temporary password. Until it is
   * cleared the app funnels the user to the change-password screen, so a password
   * that travelled over chat or email does not become the permanent one.
   */
  @Column({ type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @Column({ length: 100 })
  firstName!: string;

  @Column({ length: 100 })
  lastName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.STUDENT })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING_EMAIL_VERIFICATION,
  })
  status!: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  // --- Institution membership -------------------------------------------------

  @Column({ type: 'uuid', nullable: true })
  institutionId!: string | null;

  @ManyToOne(() => Institution, (institution) => institution.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution | null;

  @Column({
    type: 'enum',
    enum: ValidationStatus,
    default: ValidationStatus.PENDING,
  })
  validationStatus!: ValidationStatus;

  @Column({ type: 'enum', enum: ValidationMethod, nullable: true })
  validationMethod!: ValidationMethod | null;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt!: Date | null;

  /** The admin or program director who approved/rejected this person, if manual. */
  @Column({ type: 'uuid', nullable: true })
  validatedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'validatedById' })
  validatedBy!: User | null;

  /** Free-text note left when a request is rejected. Shown back to the student. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  validationNote!: string | null;

  /**
   * The institution the person *claims* to belong to when their email domain does
   * not match anything. A director of that institution sees them in their queue.
   */
  @Column({ type: 'uuid', nullable: true })
  requestedInstitutionId!: string | null;

  @ManyToOne(() => Institution, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestedInstitutionId' })
  requestedInstitution!: Institution | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // --- Derived helpers --------------------------------------------------------

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isValidated(): boolean {
    return this.validationStatus === ValidationStatus.VALIDATED;
  }

  /** Every address that signs this person in. */
  get loginEmails(): string[] {
    return this.secondaryEmail
      ? [this.email, this.secondaryEmail]
      : [this.email];
  }
}
