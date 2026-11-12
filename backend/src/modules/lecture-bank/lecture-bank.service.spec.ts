import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LectureBankService } from './lecture-bank.service';
import { Section } from './entities/section.entity';
import { Subsection } from './entities/subsection.entity';

const GLAUCOMA = 'sec-glaucoma';
const RETINA = 'sec-retina';

const makeSection = (overrides: Partial<Section> = {}): Section =>
  ({
    id: GLAUCOMA,
    name: 'Glaucoma',
    description: null,
    sortOrder: 0,
    subsections: [],
    ...overrides,
  }) as Section;

const makeSubsection = (overrides: Partial<Subsection> = {}): Subsection =>
  ({
    id: 'sub-1',
    sectionId: GLAUCOMA,
    name: 'Angle closure',
    description: null,
    sortOrder: 0,
    ...overrides,
  }) as Subsection;

/**
 * The service reaches for a query builder in three places: the two
 * name-is-free checks and the highest-order lookups. One fake covers all of
 * them — `getOne` answers the first kind and `getRawOne` the second.
 */
const makeQueryBuilder = (result: {
  one?: Section | Subsection | null;
  max?: number;
}) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result.one ?? null),
  getRawOne: jest.fn().mockResolvedValue({ max: String(result.max ?? -1) }),
});

describe('LectureBankService', () => {
  let service: LectureBankService;
  let sections: Record<string, jest.Mock>;
  let subsections: Record<string, jest.Mock>;
  let transaction: jest.Mock;

  beforeEach(async () => {
    transaction = jest.fn((run: (m: unknown) => Promise<void>) =>
      run({ update: jest.fn().mockResolvedValue({ affected: 1 }) }),
    );

    sections = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(makeSection()),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(makeSection(data))),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => makeQueryBuilder({})),
    };
    (sections as unknown as { manager: unknown }).manager = { transaction };

    subsections = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(makeSubsection()),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(makeSubsection(data))),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => makeQueryBuilder({})),
    };
    (subsections as unknown as { manager: unknown }).manager = { transaction };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LectureBankService,
        { provide: getRepositoryToken(Section), useValue: sections },
        { provide: getRepositoryToken(Subsection), useValue: subsections },
      ],
    }).compile();

    service = moduleRef.get(LectureBankService);
  });

  describe('createSection', () => {
    it('refuses a name that differs only in case', async () => {
      sections.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ one: makeSection({ name: 'Glaucoma' }) }),
      );

      await expect(service.createSection({ name: 'glaucoma' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('puts a new section at the end of the order', async () => {
      sections.createQueryBuilder.mockReturnValue(makeQueryBuilder({ max: 11 }));

      await service.createSection({ name: 'Uveitis' });

      expect(sections.create).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 12 }),
      );
    });

    it('starts at zero when there are no sections yet', async () => {
      await service.createSection({ name: 'Fundamentals' });

      expect(sections.create).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 0 }),
      );
    });
  });

  describe('createSubsection', () => {
    it('allows the same name under a different section', async () => {
      // Nothing by that name in *this* section: the check is scoped.
      subsections.createQueryBuilder.mockReturnValue(makeQueryBuilder({}));

      await expect(
        service.createSubsection(RETINA, { name: 'Cornea' }),
      ).resolves.toBeDefined();
    });

    it('refuses a duplicate within the same section', async () => {
      subsections.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ one: makeSubsection({ name: 'Cornea' }) }),
      );

      await expect(
        service.createSubsection(GLAUCOMA, { name: 'cornea' }),
      ).rejects.toThrow(ConflictException);
    });

    it('fails when the section does not exist', async () => {
      sections.findOne.mockResolvedValue(null);

      await expect(
        service.createSubsection('missing', { name: 'Cornea' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeSection', () => {
    it('refuses while subsections are filed under it, and counts them', async () => {
      subsections.count.mockResolvedValue(3);

      await expect(service.removeSection(GLAUCOMA)).rejects.toThrow(
        /still has 3 subsections/,
      );
      expect(sections.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty section', async () => {
      await service.removeSection(GLAUCOMA);

      expect(sections.delete).toHaveBeenCalledWith({ id: GLAUCOMA });
    });
  });

  describe('removeSubsection', () => {
    /**
     * Lectures do not exist yet, so the count is zero and the delete goes
     * through. The test is here to fail loudly when EYE-2 wires the real count
     * in and this branch starts to matter.
     */
    it('deletes a subsection that holds no lectures', async () => {
      await service.removeSubsection('sub-1');

      expect(subsections.delete).toHaveBeenCalledWith({ id: 'sub-1' });
    });
  });

  describe('reorderSections', () => {
    it('renumbers the list in the order given', async () => {
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      transaction.mockImplementation((run: (m: unknown) => Promise<void>) =>
        run({ update }),
      );
      sections.find.mockResolvedValue([
        makeSection({ id: 'a' }),
        makeSection({ id: 'b' }),
      ]);

      await service.reorderSections(['b', 'a']);

      expect(update).toHaveBeenCalledWith(Section, { id: 'b' }, { sortOrder: 0 });
      expect(update).toHaveBeenCalledWith(Section, { id: 'a' }, { sortOrder: 1 });
    });

    it('refuses a partial list', async () => {
      sections.find.mockResolvedValue([
        makeSection({ id: 'a' }),
        makeSection({ id: 'b' }),
      ]);

      await expect(service.reorderSections(['a'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a list with a repeated id', async () => {
      sections.find.mockResolvedValue([
        makeSection({ id: 'a' }),
        makeSection({ id: 'b' }),
      ]);

      await expect(service.reorderSections(['a', 'a'])).rejects.toThrow(
        /twice/,
      );
    });

    it('refuses an id that belongs to another list', async () => {
      sections.find.mockResolvedValue([makeSection({ id: 'a' })]);

      await expect(service.reorderSections(['z'])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateSubsection', () => {
    it('moves a subsection to the end of its new section', async () => {
      subsections.findOne.mockResolvedValue(
        makeSubsection({ sectionId: GLAUCOMA, sortOrder: 0 }),
      );
      subsections.createQueryBuilder.mockReturnValue(makeQueryBuilder({ max: 4 }));

      await service.updateSubsection('sub-1', { sectionId: RETINA });

      expect(subsections.save).toHaveBeenCalledWith(
        expect.objectContaining({ sectionId: RETINA, sortOrder: 5 }),
      );
    });

    it('checks the name against the section it is moving into', async () => {
      subsections.findOne.mockResolvedValue(
        makeSubsection({ name: 'Cornea', sectionId: GLAUCOMA }),
      );
      subsections.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ one: makeSubsection({ id: 'other', name: 'Cornea' }) }),
      );

      await expect(
        service.updateSubsection('sub-1', { sectionId: RETINA }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
