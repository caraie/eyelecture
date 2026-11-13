import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lecture, LectureAsset, Subsection]),
    StorageModule,
  ],
  providers: [LecturesService],
  controllers: [LecturesController],
  exports: [LecturesService],
})
export class LecturesModule {}
