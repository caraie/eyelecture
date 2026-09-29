import { Entity } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';

/**
 * How far along somebody is, e.g. "PGY-2". Asked of residents.
 *
 * A list rather than a number because the ladder is not the same everywhere — a
 * preliminary year, a research year, or a programme that counts from zero all break
 * an integer column, and none of them break a row in a table an administrator owns.
 */
@Entity('training_levels')
export class TrainingLevel extends CatalogItem {}
