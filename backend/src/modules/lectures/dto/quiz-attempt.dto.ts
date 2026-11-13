import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { QuizAttempt } from '../entities/quiz-attempt.entity';
import { QuizAttemptAnswer } from '../entities/quiz-attempt-answer.entity';
import { QuizPhase } from '../enums/quiz-phase.enum';

export class AnswerQuestionDto {
  @ApiProperty({ description: 'Which question of the attempt, by position' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Null clears the answer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chosenIndex?: number | null;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lectureId?: string;

  @ApiPropertyOptional({ enum: QuizPhase })
  @IsOptional()
  @IsEnum(QuizPhase)
  phase?: QuizPhase;
}

/**
 * One question of an attempt. Which answer is right is only filled in once the
 * attempt has been submitted — before that it would be the answer key.
 */
export class AttemptQuestionDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty() prompt!: string;
  @ApiProperty({ type: [String] }) options!: string[];
  @ApiProperty({ nullable: true }) chosenIndex!: number | null;
  @ApiProperty({ nullable: true }) correctIndex!: number | null;
  @ApiProperty({ nullable: true }) explanation!: string | null;

  static from(answer: QuizAttemptAnswer, marked: boolean): AttemptQuestionDto {
    const correctIndex = answer.options.findIndex((option) => option.isCorrect);
    return {
      sortOrder: answer.sortOrder,
      prompt: answer.prompt,
      options: answer.options.map((option) => option.text),
      chosenIndex: answer.chosenIndex,
      correctIndex: marked ? correctIndex : null,
      explanation: marked ? answer.explanation : null,
    };
  }
}

export class QuizAttemptDto {
  @ApiProperty() id!: string;
  @ApiProperty() lectureId!: string;
  @ApiProperty({ nullable: true }) lectureTitle!: string | null;
  @ApiProperty({ enum: QuizPhase }) phase!: QuizPhase;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ nullable: true }) submittedAt!: Date | null;
  @ApiProperty() score!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [AttemptQuestionDto] })
  questions!: AttemptQuestionDto[];

  static from(attempt: QuizAttempt): QuizAttemptDto {
    const marked = attempt.submittedAt !== null;
    return {
      id: attempt.id,
      lectureId: attempt.lectureId,
      lectureTitle: attempt.lecture?.title ?? null,
      phase: attempt.phase,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      total: attempt.total,
      questions: (attempt.answers ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((answer) => AttemptQuestionDto.from(answer, marked)),
    };
  }
}

/** The history list, where the questions themselves are not needed. */
export class QuizAttemptSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() lectureId!: string;
  @ApiProperty({ nullable: true }) lectureTitle!: string | null;
  @ApiProperty({ enum: QuizPhase }) phase!: QuizPhase;
  @ApiProperty({ nullable: true }) submittedAt!: Date | null;
  @ApiProperty() score!: number;
  @ApiProperty() total!: number;

  static from(attempt: QuizAttempt): QuizAttemptSummaryDto {
    return {
      id: attempt.id,
      lectureId: attempt.lectureId,
      lectureTitle: attempt.lecture?.title ?? null,
      phase: attempt.phase,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      total: attempt.total,
    };
  }
}
