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

/**
 * An email domain owned by an institution, stored without the "@" and lowercased
 * (e.g. "stanford.edu"). A domain belongs to exactly one institution, which is why
 * the unique index lives here and not on a JSON column.
 */
@Entity('institution_domains')
export class InstitutionDomain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 253 })
  domain!: string;

  @Column({ type: 'uuid' })
  institutionId!: string;

  @ManyToOne(() => Institution, (institution) => institution.domains, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
