import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lecture,
      LectureAsset,
      QuizQuestion,
      QuizOption,
      Subsection,
    ]),
    StorageModule,
  ],
  providers: [LecturesService, QuizzesService],
  controllers: [LecturesController, QuizzesController],
  exports: [LecturesService, QuizzesService],
})
export class LecturesModule {}
