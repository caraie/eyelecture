import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from './entities/section.entity';
import { Subsection } from './entities/subsection.entity';
import {
  CreateSectionDto,
  CreateSubsectionDto,
  UpdateSectionDto,
  UpdateSubsectionDto,
  normalizeName,
} from './dto/section.dto';

@Injectable()
export class LectureBankService {
  constructor(
    @InjectRepository(Section)
    private readonly sections: Repository<Section>,
    @InjectRepository(Subsection)
    private readonly subsections: Repository<Subsection>,
  ) {}

  /**
   * The whole catalogue in one call, sections with their subsections nested.
   * It is a dozen rows and a sidebar needs all of it at once; paginating this
   * would be ceremony.
   */
  async findTree(): Promise<Section[]> {
    return this.sections.find({
      relations: { subsections: true },
      order: {
        sortOrder: 'ASC',
        name: 'ASC',
        subsections: { sortOrder: 'ASC', name: 'ASC' },
      },
    });
  }

  async findSection(id: string): Promise<Section> {
    const section = await this.sections.findOne({
      where: { id },
      relations: { subsections: true },
    });
    if (!section) throw new NotFoundException('That section was not found');
    return section;
  }

  async createSection(dto: CreateSectionDto): Promise<Section> {
    await this.assertSectionNameIsFree(dto.name);

    return this.sections.save(
      this.sections.create({
        name: dto.name,
        description: dto.description ?? null,
        // New sections land at the end rather than at the top: the order is
        // editorial, and nobody who adds "Uveitis" means it to outrank
        // Fundamentals.
        sortOrder: (await this.highestSectionOrder()) + 1,
      }),
    );
  }

  async updateSection(id: string, dto: UpdateSectionDto): Promise<Section> {
    const section = await this.findSection(id);

    if (dto.name !== undefined && dto.name !== section.name) {
      await this.assertSectionNameIsFree(dto.name, id);
      section.name = dto.name;
    }
    if (dto.description !== undefined) {
      section.description = dto.description ?? null;
    }

    await this.sections.save(section);
    return this.findSection(id);
  }

  /**
   * Refuses while anything is filed under the section, and says how much. The
   * alternative is a cascade, which turns one wrong click into a lost shelf of
   * lectures — and the foreign key is RESTRICT precisely so a mistake here
   * fails at the database rather than succeeding quietly.
   */
  async removeSection(id: string): Promise<void> {
    const section = await this.findSection(id);

    const subsectionCount = await this.subsections.count({
      where: { sectionId: id },
    });
    if (subsectionCount > 0) {
      throw new ConflictException(
        `"${section.name}" still has ${subsectionCount} ` +
          `${subsectionCount === 1 ? 'subsection' : 'subsections'}. ` +
          'Move or delete them first.',
      );
    }

    await this.sections.delete({ id });
  }

  async createSubsection(
    sectionId: string,
    dto: CreateSubsectionDto,
  ): Promise<Subsection> {
    await this.findSection(sectionId);
    await this.assertSubsectionNameIsFree(sectionId, dto.name);

    return this.subsections.save(
      this.subsections.create({
        sectionId,
        name: dto.name,
        description: dto.description ?? null,
        sortOrder: (await this.highestSubsectionOrder(sectionId)) + 1,
      }),
    );
  }

  async findSubsection(id: string): Promise<Subsection> {
    const subsection = await this.subsections.findOne({ where: { id } });
    if (!subsection) throw new NotFoundException('That subsection was not found');
    return subsection;
  }

  async updateSubsection(
    id: string,
    dto: UpdateSubsectionDto,
  ): Promise<Subsection> {
    const subsection = await this.findSubsection(id);

    // Both comparisons are against where it was, so they have to be taken
    // before anything is assigned. Reading them off the entity afterwards means
    // comparing the new value with itself, which is always equal — and a
    // subsection moved into a section that already has that name would sail
    // past the check and fail at the unique index instead.
    const movingTo = dto.sectionId;
    const isMoving = movingTo !== undefined && movingTo !== subsection.sectionId;
    const targetSection = movingTo ?? subsection.sectionId;
    const isRenaming = dto.name !== undefined && dto.name !== subsection.name;
    const name = dto.name ?? subsection.name;

    if (isMoving) await this.findSection(targetSection);
    if (isRenaming || isMoving) {
      await this.assertSubsectionNameIsFree(targetSection, name, id);
    }

    if (isMoving) {
      subsection.sectionId = targetSection;
      // It lands at the end of its new section; the old position meant
      // something only among its old siblings.
      subsection.sortOrder = (await this.highestSubsectionOrder(targetSection)) + 1;
    }
    if (dto.name !== undefined) subsection.name = dto.name;
    if (dto.description !== undefined) {
      subsection.description = dto.description ?? null;
    }

    return this.subsections.save(subsection);
  }

  async removeSubsection(id: string): Promise<void> {
    const subsection = await this.findSubsection(id);

    const lectures = await this.countLecturesIn(id);
    if (lectures > 0) {
      throw new ConflictException(
        `"${subsection.name}" still holds ${lectures} ` +
          `${lectures === 1 ? 'lecture' : 'lectures'}. ` +
          'Move them to another subsection first.',
      );
    }

    await this.subsections.delete({ id });
  }

  /**
   * Takes the list in the order it should end up in and renumbers it. Every id
   * has to be present and belong to the list being reordered — a partial list
   * would silently leave the rest wherever they were, which is how two
   * administrators dragging at the same time produce an order neither chose.
   */
  async reorderSections(ids: string[]): Promise<Section[]> {
    const all = await this.sections.find();
    this.assertSameMembers(
      ids,
      all.map((s) => s.id),
      'sections',
    );

    await this.sections.manager.transaction(async (manager) => {
      await Promise.all(
        ids.map((id, index) =>
          manager.update(Section, { id }, { sortOrder: index }),
        ),
      );
    });

    return this.findTree();
  }

  async reorderSubsections(sectionId: string, ids: string[]): Promise<Section> {
    await this.findSection(sectionId);
    const siblings = await this.subsections.find({ where: { sectionId } });
    this.assertSameMembers(
      ids,
      siblings.map((s) => s.id),
      'subsections of this section',
    );

    await this.subsections.manager.transaction(async (manager) => {
      await Promise.all(
        ids.map((id, index) =>
          manager.update(Subsection, { id }, { sortOrder: index }),
        ),
      );
    });

    return this.findSection(sectionId);
  }

  /**
   * Lectures do not exist yet — EYE-2 adds them. This is the one place that will
   * need to count them, and it is already wired into the delete rule, so when
   * the table arrives this method is the whole change.
   */
  private async countLecturesIn(_subsectionId: string): Promise<number> {
    return 0;
  }

  /** -1 when the table is empty, so the first row created lands at 0. */
  private async highestSectionOrder(): Promise<number> {
    const row = await this.sections
      .createQueryBuilder('section')
      .select('COALESCE(MAX(section."sortOrder"), -1)', 'max')
      .getRawOne<{ max: string }>();
    return Number(row?.max ?? -1);
  }

  private async highestSubsectionOrder(sectionId: string): Promise<number> {
    const row = await this.subsections
      .createQueryBuilder('subsection')
      .select('COALESCE(MAX(subsection."sortOrder"), -1)', 'max')
      .where('subsection."sectionId" = :sectionId', { sectionId })
      .getRawOne<{ max: string }>();
    return Number(row?.max ?? -1);
  }

  /**
   * Case-insensitive, matching the unique index in the migration. Checking here
   * as well turns a 500 from the database into a message naming what is already
   * there.
   */
  private async assertSectionNameIsFree(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const query = this.sections
      .createQueryBuilder('section')
      .where('LOWER(section.name) = :name', {
        name: normalizeName(name).toLowerCase(),
      });
    if (exceptId) query.andWhere('section.id <> :exceptId', { exceptId });

    const existing = await query.getOne();
    if (existing) {
      throw new ConflictException(`"${existing.name}" is already a section`);
    }
  }

  private async assertSubsectionNameIsFree(
    sectionId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const query = this.subsections
      .createQueryBuilder('subsection')
      .where('subsection."sectionId" = :sectionId', { sectionId })
      .andWhere('LOWER(subsection.name) = :name', {
        name: normalizeName(name).toLowerCase(),
      });
    if (exceptId) query.andWhere('subsection.id <> :exceptId', { exceptId });

    const existing = await query.getOne();
    if (existing) {
      throw new ConflictException(
        `"${existing.name}" is already a subsection of this section`,
      );
    }
  }

  private assertSameMembers(
    given: string[],
    expected: string[],
    label: string,
  ): void {
    const givenSet = new Set(given);
    if (givenSet.size !== given.length) {
      throw new BadRequestException('The same id appears twice in the new order');
    }
    if (
      givenSet.size !== expected.length ||
      expected.some((id) => !givenSet.has(id))
    ) {
      throw new BadRequestException(
        `The new order must list every one of the ${label}, and nothing else`,
      );
    }
  }
}
