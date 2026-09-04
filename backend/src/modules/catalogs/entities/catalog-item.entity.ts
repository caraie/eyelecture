import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Shared shape of the three reference lists a profile is built from: specialties,
 * residency programs and fellowship programs.
 *
 * They are three tables rather than one `catalog_items` table with a `kind` column
 * because they are only identical today. A residency program belongs to an
 * institution and has a location; a specialty never will. Splitting them later
 * means a data migration; keeping them apart now costs one entity file each.
 */
export abstract class CatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  name!: string;

  /**
   * Retired entries stay selectable for whoever already chose them, but drop out
   * of the pickers. Deleting is for mistakes; this is for things that ended.
   */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
