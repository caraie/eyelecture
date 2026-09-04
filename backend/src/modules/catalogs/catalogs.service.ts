import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from './entities/catalog-item.entity';
import { Specialty } from './entities/specialty.entity';
import { ResidencyProgram } from './entities/residency-program.entity';
import { FellowshipProgram } from './entities/fellowship-program.entity';
import { CATALOG_LABELS, CatalogKind } from './catalog-kind.enum';
import {
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
  normalizeName,
} from './dto/catalog-item.dto';

@Injectable()
export class CatalogsService {
  private readonly repositories: Record<CatalogKind, Repository<CatalogItem>>;

  constructor(
    @InjectRepository(Specialty)
    specialties: Repository<Specialty>,
    @InjectRepository(ResidencyProgram)
    residencies: Repository<ResidencyProgram>,
    @InjectRepository(FellowshipProgram)
    fellowships: Repository<FellowshipProgram>,
  ) {
    this.repositories = {
      [CatalogKind.SPECIALTIES]: specialties,
      [CatalogKind.RESIDENCIES]: residencies,
      [CatalogKind.FELLOWSHIPS]: fellowships,
    };
  }

  async findAll(
    kind: CatalogKind,
    options?: { activeOnly?: boolean },
  ): Promise<CatalogItem[]> {
    return this.repo(kind).find({
      where: options?.activeOnly ? { isActive: true } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(kind: CatalogKind, id: string): Promise<CatalogItem> {
    const item = await this.repo(kind).findOne({ where: { id } });
    if (!item) throw new NotFoundException(`That ${CATALOG_LABELS[kind]} was not found`);
    return item;
  }

  async create(kind: CatalogKind, dto: CreateCatalogItemDto): Promise<CatalogItem> {
    await this.assertNameIsFree(kind, dto.name);

    const repo = this.repo(kind);
    return repo.save(
      repo.create({ name: dto.name, isActive: dto.isActive ?? true }),
    );
  }

  async update(
    kind: CatalogKind,
    id: string,
    dto: UpdateCatalogItemDto,
  ): Promise<CatalogItem> {
    const item = await this.findOne(kind, id);

    if (dto.name !== undefined && dto.name !== item.name) {
      await this.assertNameIsFree(kind, dto.name, id);
      item.name = dto.name;
    }
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    return this.repo(kind).save(item);
  }

  async remove(kind: CatalogKind, id: string): Promise<void> {
    const result = await this.repo(kind).delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`That ${CATALOG_LABELS[kind]} was not found`);
    }
  }

  private repo(kind: CatalogKind): Repository<CatalogItem> {
    return this.repositories[kind];
  }

  /**
   * Case-insensitive, matching the unique index in the migration. Checking here as
   * well turns a 500 from the database into a message naming the entry that is
   * already there.
   */
  private async assertNameIsFree(
    kind: CatalogKind,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const normalized = normalizeName(name).toLowerCase();

    const query = this.repo(kind)
      .createQueryBuilder('item')
      .where('LOWER(item.name) = :normalized', { normalized });

    if (exceptId) query.andWhere('item.id <> :exceptId', { exceptId });

    const existing = await query.getOne();
    if (existing) {
      throw new ConflictException(
        `"${existing.name}" is already on the list of ${CATALOG_LABELS[kind]}s`,
      );
    }
  }
}
