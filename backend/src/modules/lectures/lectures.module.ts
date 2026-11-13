import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { LectureProgress } from './entities/lecture-progress.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { LectureCoAuthor } from './entities/lecture-co-author.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { User } from '../users/entities/user.entity';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { QuizAttemptsService } from './quiz-attempts.service';
import { QuizAttemptsController } from './quiz-attempts.controller';
import { LectureProgressService } from './lecture-progress.service';
import { CoAuthorsService } from './co-authors.service';
import { CoAuthorsController } from './co-authors.controller';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lecture,
      LectureAsset,
      LectureProgress,
      QuizQuestion,
      QuizOption,
      QuizAttempt,
      QuizAttemptAnswer,
      LectureCoAuthor,
      Subsection,
      User,
    ]),
    StorageModule,
    MailModule,
  ],
  providers: [
    LecturesService,
    QuizzesService,
    QuizAttemptsService,
    LectureProgressService,
    CoAuthorsService,
  ],
  controllers: [
    LecturesController,
    QuizzesController,
    QuizAttemptsController,
    CoAuthorsController,
  ],
  exports: [
    LecturesService,
    QuizzesService,
    LectureProgressService,
    CoAuthorsService,
  ],
})
export class LecturesModule {}
