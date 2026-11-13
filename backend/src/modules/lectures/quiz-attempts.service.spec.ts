import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QuizAttemptsService } from './quiz-attempts.service';
import { LecturesService } from './lectures.service';
import { LectureProgressService } from './lecture-progress.service';
import { Lecture } from './entities/lecture.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { QuizAvailability } from './enums/quiz-availability.enum';
import { QuizPhase } from './enums/quiz-phase.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

const learner = (): User =>
  ({ id: 'user-resident', role: UserRole.RESIDENT }) as User;

const makeLecture = (overrides: Partial<Lecture> = {}): Lecture =>
  ({
    id: 'lec-1',
    title: 'Angle closure',
    quizAvailability: QuizAvailability.BOTH,
    ...overrides,
  }) as Lecture;

const makeQuestion = (id: string, correct: number): QuizQuestion =>
  ({
    id,
    lectureId: 'lec-1',
    prompt: `Question ${id}`,
    explanation: 'Because.',
    sortOrder: 0,
    options: [
      { text: 'A', isCorrect: correct === 0, sortOrder: 0 },
      { text: 'B', isCorrect: correct === 1, sortOrder: 1 },
    ],
  }) as QuizQuestion;

const makeAnswer = (
  sortOrder: number,
  correct: number,
  chosenIndex: number | null = null,
): QuizAttemptAnswer =>
  ({
    id: `ans-${sortOrder}`,
    attemptId: 'att-1',
    questionId: `q-${sortOrder}`,
    sortOrder,
    prompt: `Question ${sortOrder}`,
    explanation: 'Because.',
    options: [
      { text: 'A', isCorrect: correct === 0 },
      { text: 'B', isCorrect: correct === 1 },
    ],
    chosenIndex,
  }) as QuizAttemptAnswer;

const makeAttempt = (overrides: Partial<QuizAttempt> = {}): QuizAttempt =>
  ({
    id: 'att-1',
    userId: 'user-resident',
    lectureId: 'lec-1',
    phase: QuizPhase.PRE,
    startedAt: new Date(),
    submittedAt: null,
    score: 0,
    total: 2,
    lecture: makeLecture(),
    answers: [makeAnswer(0, 0), makeAnswer(1, 1)],
    ...overrides,
  }) as QuizAttempt;

describe('QuizAttemptsService', () => {
  let service: QuizAttemptsService;
  let attempts: Record<string, jest.Mock>;
  let answers: Record<string, jest.Mock>;
  let questions: Record<string, jest.Mock>;
  let lectures: Record<string, jest.Mock>;
  let progress: Record<string, jest.Mock>;

  beforeEach(async () => {
    attempts = {
      // findOne answers two different questions: "is there an open sitting?"
      // and "load this attempt". The open-sitting lookup is the one with a
      // submittedAt in its where clause.
      findOne: jest.fn((options: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'submittedAt' in options.where ? null : makeAttempt(),
        ),
      ),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve({ id: 'att-1', ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    answers = {
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    questions = {
      find: jest.fn().mockResolvedValue([makeQuestion('q-0', 0), makeQuestion('q-1', 1)]),
    };
    lectures = { findOneFor: jest.fn().mockResolvedValue(makeLecture()) };
    progress = { hasCompleted: jest.fn().mockResolvedValue(false) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuizAttemptsService,
        { provide: getRepositoryToken(QuizAttempt), useValue: attempts },
        { provide: getRepositoryToken(QuizAttemptAnswer), useValue: answers },
        { provide: getRepositoryToken(QuizQuestion), useValue: questions },
        { provide: LecturesService, useValue: lectures },
        { provide: LectureProgressService, useValue: progress },
      ],
    }).compile();

    service = moduleRef.get(QuizAttemptsService);
  });

  describe('start', () => {
    it('copies the questions into the attempt instead of pointing at them', async () => {
      await service.start('lec-1', learner());

      const saved = attempts.save.mock.calls[0][0] as {
        answers: { prompt: string; options: { text: string }[] }[];
      };
      expect(saved.answers).toHaveLength(2);
      expect(saved.answers[0].prompt).toBe('Question q-0');
      expect(saved.answers[0].options.map((o) => o.text)).toEqual(['A', 'B']);
    });

    it('calls it a pre-lecture attempt when the lecture is unfinished', async () => {
      await service.start('lec-1', learner());

      expect(attempts.save).toHaveBeenCalledWith(
        expect.objectContaining({ phase: QuizPhase.PRE }),
      );
    });

    it('calls it a post-lecture attempt once the lecture is done', async () => {
      progress.hasCompleted.mockResolvedValue(true);

      await service.start('lec-1', learner());

      expect(attempts.save).toHaveBeenCalledWith(
        expect.objectContaining({ phase: QuizPhase.POST }),
      );
    });

    it('refuses a lecture with no questions', async () => {
      questions.find.mockResolvedValue([]);

      await expect(service.start('lec-1', learner())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a second sitting while one is still open', async () => {
      attempts.findOne.mockResolvedValue(makeAttempt());

      await expect(service.start('lec-1', learner())).rejects.toThrow(
        ConflictException,
      );
    });

    it('holds back a post-only quiz until the lecture is finished', async () => {
      lectures.findOneFor.mockResolvedValue(
        makeLecture({ quizAvailability: QuizAvailability.POST }),
      );

      await expect(service.start('lec-1', learner())).rejects.toThrow(
        /after the lecture/,
      );
    });

    it('lets a draft or another institution’s lecture be refused upstream', async () => {
      lectures.findOneFor.mockRejectedValue(new NotFoundException());

      await expect(service.start('lec-1', learner())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('answer', () => {
    it('records the choice', async () => {
      await service.answer('att-1', { sortOrder: 1, chosenIndex: 0 }, learner());

      expect(answers.save).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 1, chosenIndex: 0 }),
      );
    });

    it('refuses an answer that is not one of the choices', async () => {
      await expect(
        service.answer('att-1', { sortOrder: 0, chosenIndex: 9 }, learner()),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a question that is not in this attempt', async () => {
      await expect(
        service.answer('att-1', { sortOrder: 7, chosenIndex: 0 }, learner()),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to change a submitted attempt', async () => {
      attempts.findOne.mockImplementation(
        (options: { where: Record<string, unknown> }) =>
          Promise.resolve(
            'submittedAt' in options.where
              ? null
              : makeAttempt({ submittedAt: new Date() }),
          ),
      );

      await expect(
        service.answer('att-1', { sortOrder: 0, chosenIndex: 0 }, learner()),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submit', () => {
    it('marks against the snapshot, counting blanks as wrong', async () => {
      attempts.findOne.mockImplementation(
        (options: { where: Record<string, unknown> }) =>
          Promise.resolve(
            'submittedAt' in options.where
              ? null
              : makeAttempt({
                  answers: [
                    makeAnswer(0, 0, 0), // right
                    makeAnswer(1, 1, 0), // wrong
                    makeAnswer(2, 0, null), // left blank
                  ],
                }),
          ),
      );

      await service.submit('att-1', learner());

      expect(attempts.save).toHaveBeenCalledWith(
        expect.objectContaining({ score: 1, total: 3 }),
      );
    });

    it('stamps the time it was handed in', async () => {
      await service.submit('att-1', learner());

      const saved = attempts.save.mock.calls[0][0] as { submittedAt: Date };
      expect(saved.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe('discard', () => {
    it('refuses to throw away a submitted attempt', async () => {
      attempts.findOne.mockImplementation(
        (options: { where: Record<string, unknown> }) =>
          Promise.resolve(
            'submittedAt' in options.where
              ? null
              : makeAttempt({ submittedAt: new Date() }),
          ),
      );

      await expect(service.discard('att-1', learner())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('privacy', () => {
    it('only ever looks for attempts belonging to the asker', async () => {
      await service.review('att-1', learner());

      expect(attempts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-1', userId: 'user-resident' },
        }),
      );
    });

    it('is a 404, not a 403, for somebody else’s attempt', async () => {
      attempts.findOne.mockResolvedValue(null);

      await expect(service.review('att-1', learner())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('leaves unfinished sittings out of the history', async () => {
      await service.history(learner());

      const where = attempts.find.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(where['userId']).toBe('user-resident');
      expect(where['submittedAt']).toBeDefined();
    });
  });
});
