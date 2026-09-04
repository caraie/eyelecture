import { Entity } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';

/** Where somebody did their residency, e.g. "Montefiore-Einstein". */
@Entity('residency_programs')
export class ResidencyProgram extends CatalogItem {}
