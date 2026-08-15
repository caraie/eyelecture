import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InstitutionDomain } from './institution-domain.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A university, hospital or school. Owns one or more email domains; anybody who
 * registers with an address on one of those domains is auto-validated into it.
 */
@Entity('institutions')
export class Institution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  name!: string;

  /** URL-friendly identifier, e.g. "stanford-medicine". Unique. */
  @Index({ unique: true })
  @Column({ length: 120 })
  slug!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  /** Absolute URL to the institution logo, if any. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  /** Inactive institutions stop auto-validating new signups. */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => InstitutionDomain, (domain) => domain.institution, {
    cascade: ['insert'],
  })
  domains!: InstitutionDomain[];

  @OneToMany(() => User, (user) => user.institution)
  users!: User[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
