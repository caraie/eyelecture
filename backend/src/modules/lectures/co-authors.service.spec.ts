import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CoAuthorsService } from './co-authors.service';
import { Lecture } from './entities/lecture.entity';
import { LectureCoAuthor } from './entities/lecture-co-author.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { MailerService } from '../mail/mailer.service';

const AUTHOR = 'user-author';

const author = (overrides: Partial<User> = {}): User =>
  ({
    id: AUTHOR,
    firstName: 'Sally',
    lastName: 'Chen',
    role: UserRole.ATTENDING_PHYSICIAN,
    institutionId: 'inst-montefiore',
    ...overrides,
  }) as User;

const makeLecture = (overrides: Partial<Lecture> = {}): Lecture =>
  ({
    id: 'lec-1',
    title: 'Angle closure',
    authorId: AUTHOR,
    institutionId: 'inst-montefiore',
    ...overrides,
  }) as Lecture;

const makeRow = (overrides: Partial<LectureCoAuthor> = {}): LectureCoAuthor => {
  const row = new LectureCoAuthor();
  Object.assign(row, {
    id: 'ca-1',
    lectureId: 'lec-1',
    userId: null,
    email: 'dave@montefiore.org',
    invitedName: 'Dave',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    sortOrder: 0,
    ...overrides,
  });
  return row;
};

describe('CoAuthorsService', () => {
  let service: CoAuthorsService;
  let coAuthors: Record<string, jest.Mock>;
  let lectures: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let mailer: Record<string, jest.Mock>;

  beforeEach(async () => {
    coAuthors = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    lectures = { findOne: jest.fn().mockResolvedValue(makeLecture()) };
    users = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    mailer = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CoAuthorsService,
        { provide: getRepositoryToken(LectureCoAuthor), useValue: coAuthors },
        { provide: getRepositoryToken(Lecture), useValue: lectures },
        { provide: getRepositoryToken(User), useValue: users },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('https://eyelecture.test'),
            get: jest.fn().mockReturnValue('test'),
          },
        },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = moduleRef.get(CoAuthorsService);
  });

  describe('add', () => {
    it('refuses to credit the author as their own co-author', async () => {
      await expect(service.add('lec-1', AUTHOR, author())).rejects.toThrow(
        /already the author/,
      );
    });

    it('refuses the same person twice', async () => {
      users.findOne.mockResolvedValue({ id: 'user-jamie' } as User);
      coAuthors.findOne.mockResolvedValue(makeRow({ userId: 'user-jamie' }));

      await expect(
        service.add('lec-1', 'user-jamie', author()),
      ).rejects.toThrow(ConflictException);
    });

    it('turns their own outstanding invitation into the real thing', async () => {
      const invited = makeRow();
      users.findOne.mockResolvedValue({
        id: 'user-dave',
        email: 'dave@montefiore.org',
      } as User);
      coAuthors.findOne
        .mockResolvedValueOnce(null) // not already credited
        .mockResolvedValueOnce(invited); // but written to

      await service.add('lec-1', 'user-dave', author());

      expect(coAuthors.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ca-1',
          userId: 'user-dave',
          tokenHash: null,
        }),
      );
      // One row, not a second chip next to the first.
      expect(coAuthors.create).not.toHaveBeenCalled();
    });
  });

  describe('invite', () => {
    it('credits an address that already has an account instead of writing to it', async () => {
      users.findOne.mockResolvedValue({
        id: 'user-jamie',
        email: 'jamie@montefiore.org',
      } as User);

      const { link } = await service.invite(
        'lec-1',
        'Jamie@Montefiore.org',
        null,
        author(),
      );

      expect(mailer.send).not.toHaveBeenCalled();
      expect(link).toBeNull();
    });

    it('writes to somebody who is not on the platform', async () => {
      const { link } = await service.invite(
        'lec-1',
        'dave@montefiore.org',
        'Dave',
        author(),
      );

      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(link).toContain('coAuthor=');
    });

    it('stores the token hashed, never the link that was sent', async () => {
      const { link } = await service.invite(
        'lec-1',
        'dave@montefiore.org',
        null,
        author(),
      );

      const saved = coAuthors.create.mock.calls[0][0] as { tokenHash: string };
      // SHA-256 in hex, and nothing resembling the token that went out.
      expect(saved.tokenHash).toHaveLength(64);
      expect(link).not.toContain(saved.tokenHash);
    });

    it('lowercases the address before it is stored', async () => {
      await service.invite('lec-1', '  Dave@Montefiore.ORG ', null, author());

      expect(coAuthors.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'dave@montefiore.org' }),
      );
    });

    it('refuses a second invitation while one is still live', async () => {
      coAuthors.findOne.mockResolvedValue(makeRow());

      await expect(
        service.invite('lec-1', 'dave@montefiore.org', null, author()),
      ).rejects.toThrow(ConflictException);
    });

    it('clears a stale invitation out of the way instead', async () => {
      coAuthors.findOne.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() - 86_400_000) }),
      );

      await service.invite('lec-1', 'dave@montefiore.org', null, author());

      expect(coAuthors.update).toHaveBeenCalledWith(
        { id: 'ca-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('resend', () => {
    it('refuses when there is nothing outstanding', async () => {
      coAuthors.findOne.mockResolvedValue(
        makeRow({ userId: 'user-dave', acceptedAt: new Date() }),
      );

      await expect(
        service.resend('lec-1', 'ca-1', author()),
      ).rejects.toThrow(BadRequestException);
    });

    it('issues a fresh token rather than resending the old link', async () => {
      const row = makeRow();
      coAuthors.findOne.mockResolvedValue(row);

      await service.resend('lec-1', 'ca-1', author());

      expect(row.tokenHash).not.toBe('hash');
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('marks the credit withdrawn rather than deleting the record', async () => {
      coAuthors.findOne.mockResolvedValue(makeRow({ userId: 'user-jamie' }));

      await service.remove('lec-1', 'ca-1', author());

      expect(coAuthors.update).toHaveBeenCalledWith(
        { id: 'ca-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('permissions', () => {
    it('hides somebody else’s lecture as a 404 rather than a 403', async () => {
      await expect(
        service.invite(
          'lec-1',
          'dave@montefiore.org',
          null,
          author({ id: 'stranger', role: UserRole.FELLOW }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets the institution’s program administrator manage the list', async () => {
      await expect(
        service.invite(
          'lec-1',
          'dave@montefiore.org',
          null,
          author({ id: 'other', role: UserRole.PROGRAM_ADMINISTRATOR }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('search', () => {
    it('says nothing for a term too short to mean anything', async () => {
      await expect(service.search('d', author())).resolves.toEqual([]);
      expect(users.find).not.toHaveBeenCalled();
    });

    it('leaves the person doing the searching out of their own results', async () => {
      users.find.mockResolvedValue([
        { id: AUTHOR } as User,
        { id: 'user-jamie' } as User,
      ]);

      const found = await service.search('chen', author());

      expect(found.map((user) => user.id)).toEqual(['user-jamie']);
    });
  });

  describe('claimInvitations', () => {
    it('hands a new account the credits waiting on its address', async () => {
      const row = makeRow();
      coAuthors.find.mockResolvedValue([row]);

      const claimed = await service.claimInvitations({
        id: 'user-dave',
        email: 'dave@montefiore.org',
        personalEmail: null,
      } as User);

      expect(claimed).toBe(1);
      expect(row.userId).toBe('user-dave');
      expect(row.tokenHash).toBeNull();
    });

    it('spends, rather than duplicates, an invitation to somebody already credited', async () => {
      const row = makeRow();
      coAuthors.find.mockResolvedValue([row]);
      coAuthors.findOne.mockResolvedValue(
        makeRow({ id: 'ca-2', userId: 'user-dave' }),
      );

      const claimed = await service.claimInvitations({
        id: 'user-dave',
        email: 'dave@montefiore.org',
        personalEmail: null,
      } as User);

      expect(claimed).toBe(0);
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(row.userId).toBeNull();
    });

    it('does nothing for an account with no address yet', async () => {
      const claimed = await service.claimInvitations({
        id: 'user-new',
        email: null,
        personalEmail: null,
      } as User);

      expect(claimed).toBe(0);
      expect(coAuthors.find).not.toHaveBeenCalled();
    });
  });
});
