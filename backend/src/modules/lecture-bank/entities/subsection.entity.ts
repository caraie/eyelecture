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
import { Section } from './section.entity';

/**
 * The second and last level of the catalogue — "Cornea" inside "Board Review".
 * Lectures hang off this, not off the Section.
 */
@Entity('lecture_subsections')
// Lookups are always "the subsections of this section", so the FK gets its own
// index. The uniqueness of the name within the section is in the migration
// instead, on (sectionId, LOWER(name)) — see the note on `name`.
@Index('IDX_lecture_subsections_section', ['sectionId'])
export class Subsection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => Section, (section) => section.subsections, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sectionId' })
  section!: Section;

  /**
   * Unique within its own Section only, case-insensitively: "Cornea" under Board
   * Review and "Cornea" under Fundamentals are different shelves, and both are
   * reasonable things to have; two of them in the same Section are not. The
   * index is functional, so it lives in the migration rather than here.
   */
  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  /** Ordered within the Section, same rules as the Section's own order. */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
