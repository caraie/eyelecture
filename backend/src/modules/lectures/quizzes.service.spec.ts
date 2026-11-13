import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { Lecture } from './entities/lecture.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { QuizAvailability } from './enums/quiz-availability.enum';
import { SaveQuestionDto } from './dto/quiz.dto';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-author',
    role: UserRole.ATTENDING_PHYSICIAN,
    institutionId: 'inst-montefiore',
    ...overrides,
  }) as User;

const makeLecture = (overrides: Partial<Lecture> = {}): Lecture =>
  ({
    id: 'lec-1',
    authorId: 'user-author',
    institutionId: 'inst-montefiore',
    quizAvailability: QuizAvailability.BOTH,
    ...overrides,
  }) as Lecture;

const makeQuestion = (overrides: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id: 'q-1',
    lectureId: 'lec-1',
    prompt: 'Which finding most suggests angle closure?',
    explanation: null,
    imageObjectKey: null,
    sortOrder: 0,
    options: [],
    ...overrides,
  }) as QuizQuestion;

const good = (): SaveQuestionDto => ({
  prompt: 'Which finding most suggests angle closure?',
  options: [
    { text: 'Shallow anterior chamber', isCorrect: true },
    { text: 'Deep anterior chamber', isCorrect: false },
  ],
});

describe('QuizzesService', () => {
  let service: QuizzesService;
  let lectures: Record<string, jest.Mock>;
  let questions: Record<string, jest.Mock>;
  let options: Record<string, jest.Mock>;

  beforeEach(async () => {
    lectures = {
      findOne: jest.fn().mockResolvedValue(makeLecture()),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    questions = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(makeQuestion()),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve({ id: 'q-1', ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '-1' }),
      })),
    };
    (questions as unknown as { manager: unknown }).manager = {
      transaction: jest.fn((run: (m: unknown) => Promise<void>) =>
        run({ update: jest.fn().mockResolvedValue({ affected: 1 }) }),
      ),
    };
    options = {
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: getRepositoryToken(Lecture), useValue: lectures },
        { provide: getRepositoryToken(QuizQuestion), useValue: questions },
        { provide: getRepositoryToken(QuizOption), useValue: options },
      ],
    }).compile();

    service = moduleRef.get(QuizzesService);
  });

  describe('validation', () => {
    it('refuses a question with nothing to ask', async () => {
      await expect(
        service.create('lec-1', { ...good(), prompt: '   ' }, makeUser()),
      ).rejects.toThrow(/something to ask/);
    });

    it('refuses fewer than two answers', async () => {
      await expect(
        service.create(
          'lec-1',
          { ...good(), options: [{ text: 'Only one', isCorrect: true }] },
          makeUser(),
        ),
      ).rejects.toThrow(/between 2 and 6/);
    });

    it('refuses more than six answers', async () => {
      await expect(
        service.create(
          'lec-1',
          {
            ...good(),
            options: Array.from({ length: 7 }, (_, index) => ({
              text: `Option ${index}`,
              isCorrect: index === 0,
            })),
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a question with no correct answer', async () => {
      await expect(
        service.create(
          'lec-1',
          {
            ...good(),
            options: [
              { text: 'A', isCorrect: false },
              { text: 'B', isCorrect: false },
            ],
          },
          makeUser(),
        ),
      ).rejects.toThrow(/Mark the correct answer/);
    });

    it('refuses two correct answers', async () => {
      await expect(
        service.create(
          'lec-1',
          {
            ...good(),
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: true },
            ],
          },
          makeUser(),
        ),
      ).rejects.toThrow(/Only one answer/);
    });

    it('refuses an answer with no text', async () => {
      await expect(
        service.create(
          'lec-1',
          {
            ...good(),
            options: [
              { text: 'A', isCorrect: true },
              { text: '  ', isCorrect: false },
            ],
          },
          makeUser(),
        ),
      ).rejects.toThrow(/Every answer needs text/);
    });

    it('accepts a question that follows the rules', async () => {
      await expect(
        service.create('lec-1', good(), makeUser()),
      ).resolves.toBeDefined();
    });
  });

  describe('create', () => {
    it('keeps the answers in the order they were given', async () => {
      await service.create('lec-1', good(), makeUser());

      const saved = questions.save.mock.calls[0][0] as {
        options: { text: string; sortOrder: number }[];
      };
      expect(saved.options.map((o) => o.sortOrder)).toEqual([0, 1]);
      expect(saved.options[0].text).toBe('Shallow anterior chamber');
    });

    it('puts a new question at the end', async () => {
      questions.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '4' }),
      });

      await service.create('lec-1', good(), makeUser());

      expect(questions.save).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 5 }),
      );
    });
  });

  describe('update', () => {
    it('replaces the answers rather than merging them', async () => {
      await service.update('q-1', good(), makeUser());

      expect(options.delete).toHaveBeenCalledWith({ questionId: 'q-1' });
      expect(options.save).toHaveBeenCalled();
    });

    it('still enforces the rules', async () => {
      await expect(
        service.update('q-1', { ...good(), prompt: '' }, makeUser()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorder', () => {
    it('refuses a list that is missing a question', async () => {
      questions.find.mockResolvedValue([
        makeQuestion({ id: 'a' }),
        makeQuestion({ id: 'b' }),
      ]);

      await expect(service.reorder('lec-1', ['a'], makeUser())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('renumbers in the order given', async () => {
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      (questions as unknown as { manager: { transaction: jest.Mock } }).manager.transaction =
        jest.fn((run: (m: unknown) => Promise<void>) => run({ update }));
      questions.find.mockResolvedValue([
        makeQuestion({ id: 'a' }),
        makeQuestion({ id: 'b' }),
      ]);

      await service.reorder('lec-1', ['b', 'a'], makeUser());

      expect(update).toHaveBeenCalledWith(QuizQuestion, { id: 'b' }, { sortOrder: 0 });
      expect(update).toHaveBeenCalledWith(QuizQuestion, { id: 'a' }, { sortOrder: 1 });
    });
  });

  describe('permissions', () => {
    it('refuses somebody else’s lecture', async () => {
      await expect(
        service.create('lec-1', good(), makeUser({ id: 'stranger' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the institution’s program administrator in', async () => {
      await expect(
        service.create(
          'lec-1',
          good(),
          makeUser({ id: 'other', role: UserRole.PROGRAM_ADMINISTRATOR }),
        ),
      ).resolves.toBeDefined();
    });

    it('fails on a lecture that does not exist', async () => {
      lectures.findOne.mockResolvedValue(null);

      await expect(
        service.create('nope', good(), makeUser()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('availability', () => {
    it('stores when the quiz can be taken', async () => {
      await service.setAvailability('lec-1', QuizAvailability.POST, makeUser());

      expect(lectures.save).toHaveBeenCalledWith(
        expect.objectContaining({ quizAvailability: QuizAvailability.POST }),
      );
    });
  });
});
