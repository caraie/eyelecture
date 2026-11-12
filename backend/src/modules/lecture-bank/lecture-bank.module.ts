import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from './entities/section.entity';
import { Subsection } from './entities/subsection.entity';
import { LectureBankService } from './lecture-bank.service';
import { LectureBankController } from './lecture-bank.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Section, Subsection])],
  providers: [LectureBankService],
  controllers: [LectureBankController],
  exports: [LectureBankService],
})
export class LectureBankModule {}
