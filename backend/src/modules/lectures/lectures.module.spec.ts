import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LecturesModule } from './lectures.module';
import { LecturesService } from './lectures.service';
import { QuizzesService } from './quizzes.service';
import { QuizAttemptsService } from './quiz-attempts.service';
import { LectureProgressService } from './lecture-progress.service';
import { CoAuthorsService } from './co-authors.service';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { LectureProgress } from './entities/lecture-progress.entity';
import { LectureCoAuthor } from './entities/lecture-co-author.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { User } from '../users/entities/user.entity';
import { configuration } from '../../config/configuration';

const ENTITIES = [
  Lecture,
  LectureAsset,
  LectureProgress,
  LectureCoAuthor,
  QuizQuestion,
  QuizOption,
  QuizAttempt,
  QuizAttemptAnswer,
  Subsection,
  User,
];

/**
 * Boots the module for real, with only the database and the mail transport
 * stubbed.
 *
 * Wiring faults — a provider nobody registered, a repository nobody asked
 * TypeORM for, a cycle between two modules — do not fail a unit test and do
 * not fail `tsc`. They fail at startup, which on Cloud Run means a revision
 * that never serves: exactly how the storage module's missing secret got into
 * a deploy. This catches that class of mistake here instead.
 */
describe('LecturesModule', () => {
  // The storage module signs its own local-disk URLs, so booting this module
  // needs the same secret the API does. Set here rather than in the shell, so
  // the test says what it depends on.
  process.env['JWT_ACCESS_SECRET'] ??= 'test-access-secret';

  let moduleRef: Awaited<ReturnType<TestingModuleBuilder['compile']>>;

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          ignoreEnvFile: true,
          isGlobal: true,
        }),
        LecturesModule,
      ],
    });

    for (const entity of ENTITIES) {
      builder
        .overrideProvider(getRepositoryToken(entity))
        .useValue({} as Repository<unknown>);
    }
    builder.overrideProvider(DataSource).useValue({});

    moduleRef = await builder.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it.each([
    ['lectures', LecturesService],
    ['quiz authoring', QuizzesService],
    ['quiz attempts', QuizAttemptsService],
    ['lecture progress', LectureProgressService],
    ['co-authors', CoAuthorsService],
  ])('resolves the %s service', (_name, token) => {
    expect(moduleRef.get(token)).toBeDefined();
  });
});
