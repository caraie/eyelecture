import { Entity } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';

/** Clinical focus, e.g. "Glaucoma". Chosen by attending physicians. */
@Entity('specialties')
export class Specialty extends CatalogItem {}
