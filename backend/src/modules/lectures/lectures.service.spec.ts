import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LecturesService } from './lectures.service';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LectureAssetKind } from './enums/lecture-asset-kind.enum';
import { LectureStatus } from './enums/lecture-status.enum';
import { LectureVisibility } from './enums/lecture-visibility.enum';
import { StorageService } from '../storage/storage.service';

const MONTEFIORE = 'inst-montefiore';
const STANFORD = 'inst-stanford';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-author',
    role: UserRole.ATTENDING_PHYSICIAN,
    institutionId: MONTEFIORE,
    firstName: 'Ada',
    lastName: 'Lovelace',
    ...overrides,
  }) as User;

const makeAsset = (overrides: Partial<LectureAsset> = {}): LectureAsset =>
  ({
    id: 'asset-1',
    lectureId: 'lec-1',
    kind: LectureAssetKind.PRESENTATION,
    objectKey: 'lectures/lec-1/presentation/abc.pdf',
    fileName: 'slides.pdf',
    contentType: 'application/pdf',
    sizeBytes: '1024',
    uploadedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }) as LectureAsset;

const makeLecture = (overrides: Partial<Lecture> = {}): Lecture =>
  ({
    id: 'lec-1',
    subsectionId: 'sub-1',
    title: 'Angle closure',
    objectives: null,
    keywords: [],
    authorId: 'user-author',
    institutionId: MONTEFIORE,
    visibility: LectureVisibility.ALL_INSTITUTIONS,
    status: LectureStatus.DRAFT,
    publishedAt: null,
    assets: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Lecture;

describe('LecturesService', () => {
  let service: LecturesService;
  let lectures: Record<string, jest.Mock>;
  let assets: Record<string, jest.Mock>;
  let subsections: Record<string, jest.Mock>;
  let questions: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;

  beforeEach(async () => {
    lectures = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(makeLecture()),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(makeLecture(data))),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    assets = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(makeAsset(data))),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    subsections = { findOne: jest.fn().mockResolvedValue({ id: 'sub-1' }) };
    // Only used to count each lecture's questions; no test here asserts on it,
    // so an empty result is enough — every lecture comes back with zero.
    questions = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };
    storage = {
      uploadUrl: jest.fn().mockResolvedValue({
        url: 'https://storage.test/put',
        headers: { 'Content-Type': 'application/pdf' },
        expiresAt: new Date(),
      }),
      readUrl: jest.fn().mockResolvedValue('https://storage.test/get'),
      stat: jest.fn().mockResolvedValue({ size: 2048 }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LecturesService,
        { provide: getRepositoryToken(Lecture), useValue: lectures },
        { provide: getRepositoryToken(LectureAsset), useValue: assets },
        { provide: getRepositoryToken(Subsection), useValue: subsections },
        { provide: getRepositoryToken(QuizQuestion), useValue: questions },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = moduleRef.get(LecturesService);
  });

  describe('create', () => {
    it('starts as a draft and keeps the author’s institution', async () => {
      await service.create(
        { subsectionId: 'sub-1', title: 'Angle closure' },
        makeUser(),
      );

      expect(lectures.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LectureStatus.DRAFT,
          authorId: 'user-author',
          institutionId: MONTEFIORE,
        }),
      );
    });

    it('refuses a subsection that does not exist', async () => {
      subsections.findOne.mockResolvedValue(null);

      await expect(
        service.create({ subsectionId: 'nope', title: 'X' }, makeUser()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestUpload', () => {
    it('refuses a presentation that is not a PDF', async () => {
      await expect(
        service.requestUpload(
          'lec-1',
          LectureAssetKind.PRESENTATION,
          {
            fileName: 'slides.pptx',
            contentType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            sizeBytes: 1024,
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a video over the size limit', async () => {
      await expect(
        service.requestUpload(
          'lec-1',
          LectureAssetKind.VIDEO,
          {
            fileName: 'talk.mp4',
            contentType: 'video/mp4',
            sizeBytes: 6 * 1024 * 1024 * 1024,
          },
          makeUser(),
        ),
      ).rejects.toThrow(/larger than/);
    });

    it('builds the key itself rather than trusting the file name', async () => {
      await service.requestUpload(
        'lec-1',
        LectureAssetKind.PRESENTATION,
        {
          fileName: '../../etc/passwd.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
        makeUser(),
      );

      const [key] = storage.uploadUrl.mock.calls[0];
      expect(key).toMatch(/^lectures\/lec-1\/presentation\/[0-9a-f-]+\.pdf$/);
      expect(key).not.toContain('..');
    });

    it('leaves the old file in place until the new one is confirmed', async () => {
      assets.findOne.mockResolvedValue(
        makeAsset({ objectKey: 'lectures/lec-1/presentation/old.pdf' }),
      );

      await service.requestUpload(
        'lec-1',
        LectureAssetKind.PRESENTATION,
        { fileName: 'new.pdf', contentType: 'application/pdf', sizeBytes: 10 },
        makeUser(),
      );

      expect(storage.remove).not.toHaveBeenCalled();
      expect(assets.save).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedAt: null }),
      );
    });
  });

  describe('confirmUpload', () => {
    it('refuses when the object is not in the bucket', async () => {
      assets.findOne.mockResolvedValue(makeAsset({ uploadedAt: null }));
      storage.stat.mockResolvedValue(null);

      await expect(
        service.confirmUpload('lec-1', LectureAssetKind.PRESENTATION, makeUser()),
      ).rejects.toThrow(ConflictException);
    });

    it('takes the size from the bucket, not from the browser', async () => {
      assets.findOne.mockResolvedValue(
        makeAsset({ uploadedAt: null, sizeBytes: '1' }),
      );

      await service.confirmUpload(
        'lec-1',
        LectureAssetKind.PRESENTATION,
        makeUser(),
      );

      expect(assets.save).toHaveBeenCalledWith(
        expect.objectContaining({ sizeBytes: '2048' }),
      );
    });
  });

  describe('publish', () => {
    it('refuses without a presentation', async () => {
      lectures.findOne.mockResolvedValue(makeLecture({ assets: [] }));

      await expect(service.publish('lec-1', makeUser())).rejects.toThrow(
        /presentation/,
      );
    });

    it('refuses when the presentation was never confirmed', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({ assets: [makeAsset({ uploadedAt: null })] }),
      );

      await expect(service.publish('lec-1', makeUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('publishes once the presentation is there', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({ assets: [makeAsset()] }),
      );

      await service.publish('lec-1', makeUser());

      expect(lectures.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LectureStatus.PUBLISHED }),
      );
    });
  });

  describe('permissions', () => {
    it('refuses an edit by somebody else’s account', async () => {
      await expect(
        service.update('lec-1', { title: 'Hijacked' }, makeUser({ id: 'other' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a program administrator at the same institution edit', async () => {
      await expect(
        service.update(
          'lec-1',
          { title: 'Edited' },
          makeUser({
            id: 'other',
            role: UserRole.PROGRAM_ADMINISTRATOR,
            institutionId: MONTEFIORE,
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('refuses a program administrator from another institution', async () => {
      await expect(
        service.update(
          'lec-1',
          { title: 'Edited' },
          makeUser({
            id: 'other',
            role: UserRole.PROGRAM_ADMINISTRATOR,
            institutionId: STANFORD,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hides a draft from everyone but its author, as a 404', async () => {
      await expect(
        service.findOneFor('lec-1', makeUser({ id: 'stranger', role: UserRole.RESIDENT })),
      ).rejects.toThrow(NotFoundException);
    });

    it('hides an institution-only lecture from other institutions', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({
          status: LectureStatus.PUBLISHED,
          visibility: LectureVisibility.OWN_INSTITUTION,
        }),
      );

      await expect(
        service.findOneFor(
          'lec-1',
          makeUser({ id: 'stranger', role: UserRole.RESIDENT, institutionId: STANFORD }),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeAsset', () => {
    it('refuses to strip a published lecture of its presentation', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({ status: LectureStatus.PUBLISHED, assets: [makeAsset()] }),
      );

      await expect(
        service.removeAsset('lec-1', LectureAssetKind.PRESENTATION, makeUser()),
      ).rejects.toThrow(ConflictException);
    });

    it('deletes the object before the row', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({ assets: [makeAsset({ kind: LectureAssetKind.VIDEO })] }),
      );
      assets.findOne.mockResolvedValue(
        makeAsset({ kind: LectureAssetKind.VIDEO, objectKey: 'k' }),
      );

      await service.removeAsset('lec-1', LectureAssetKind.VIDEO, makeUser());

      expect(storage.remove).toHaveBeenCalledWith('k');
      expect(assets.delete).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('clears the files out of the bucket before dropping the lecture', async () => {
      lectures.findOne.mockResolvedValue(
        makeLecture({
          assets: [
            makeAsset({ objectKey: 'a' }),
            makeAsset({ kind: LectureAssetKind.VIDEO, objectKey: 'b' }),
          ],
        }),
      );

      await service.remove('lec-1', makeUser());

      expect(storage.remove).toHaveBeenCalledWith('a');
      expect(storage.remove).toHaveBeenCalledWith('b');
      expect(lectures.delete).toHaveBeenCalledWith({ id: 'lec-1' });
    });
  });
});
