import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Specialty } from './entities/specialty.entity';
import { ResidencyProgram } from './entities/residency-program.entity';
import { FellowshipProgram } from './entities/fellowship-program.entity';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Specialty, ResidencyProgram, FellowshipProgram]),
  ],
  providers: [CatalogsService],
  controllers: [CatalogsController],
  exports: [CatalogsService],
})
export class CatalogsModule {}
