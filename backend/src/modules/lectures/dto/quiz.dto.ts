import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { QuizQuestion } from '../entities/quiz-question.entity';
import { QuizOption } from '../entities/quiz-option.entity';
import { QuizAvailability } from '../enums/quiz-availability.enum';

export class SaveOptionDto {
  @ApiProperty({ example: 'Shallow anterior chamber' })
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  @MaxLength(500)
  text!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  isCorrect!: boolean;
}

export class SaveQuestionDto {
  @ApiProperty({ example: 'Which finding most suggests angle closure?' })
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  @MaxLength(2000)
  prompt!: string;

  /** Shown to the learner after they answer, never before. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string | null;

  @ApiProperty({ type: [SaveOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SaveOptionDto)
  options!: SaveOptionDto[];
}

export class ReorderQuestionsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class SetAvailabilityDto {
  @ApiProperty({ enum: QuizAvailability })
  @IsEnum(QuizAvailability)
  availability!: QuizAvailability;
}

export class QuizOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() isCorrect!: boolean;

  static from(option: QuizOption): QuizOptionDto {
    return { id: option.id, text: option.text, isCorrect: option.isCorrect };
  }
}

/** The author's view of a question: the answers, and which one is right. */
export class QuizQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ nullable: true }) explanation!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [QuizOptionDto] }) options!: QuizOptionDto[];

  static from(question: QuizQuestion): QuizQuestionDto {
    return {
      id: question.id,
      prompt: question.prompt,
      explanation: question.explanation,
      sortOrder: question.sortOrder,
      options: [...(question.options ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(QuizOptionDto.from),
    };
  }
}
