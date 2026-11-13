import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { LectureProgress } from './entities/lecture-progress.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { QuizAttemptsService } from './quiz-attempts.service';
import { QuizAttemptsController } from './quiz-attempts.controller';
import { LectureProgressService } from './lecture-progress.service';
import { StorageModule } from '../storage/storage.module';

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
      Subsection,
    ]),
    StorageModule,
  ],
  providers: [
    LecturesService,
    QuizzesService,
    QuizAttemptsService,
    LectureProgressService,
  ],
  controllers: [
    LecturesController,
    QuizzesController,
    QuizAttemptsController,
  ],
  exports: [LecturesService, QuizzesService, LectureProgressService],
})
export class LecturesModule {}
