import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Subsection } from './subsection.entity';

/**
 * The top level of the Lecture Bank catalogue — "Glaucoma", "Clinical Optics".
 *
 * Two levels and no more: a Section holds Subsections, a Subsection holds
 * lectures, and every lecture belongs to exactly one Subsection. A tree of
 * arbitrary depth would be a day's work and a decade of people wondering which
 * level a lecture should sit at.
 */
@Entity('lecture_sections')
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Unique across the catalogue, case-insensitively. The index lives only in the
   * migration, on `LOWER(name)`: TypeORM cannot express a functional index, and
   * declaring a plain one here would have `migration:generate` offer to replace
   * it on every run. The catalog tables do the same.
   *
   * Two sections called "Retina" and "retina" would be two places to file the
   * same lecture, which is the one thing this table exists to prevent.
   */
  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  /**
   * Explicit, because the order is editorial: Fundamentals comes first and
   * alphabetical would bury it between Clinical Optics and Glaucoma. Ties fall
   * back to the name, so a section added without a position still lands somewhere
   * predictable.
   */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => Subsection, (subsection) => subsection.section)
  subsections!: Subsection[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
