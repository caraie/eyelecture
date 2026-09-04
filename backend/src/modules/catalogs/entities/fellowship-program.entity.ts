import { Entity } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';

/** Where somebody did their fellowship, e.g. "Stanford Medical Center". */
@Entity('fellowship_programs')
export class FellowshipProgram extends CatalogItem {}
