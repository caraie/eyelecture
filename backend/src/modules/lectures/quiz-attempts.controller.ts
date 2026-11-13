import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizAttemptsService } from './quiz-attempts.service';
import { LectureProgressService } from './lecture-progress.service';
import {
  AnswerQuestionDto,
  HistoryQueryDto,
  QuizAttemptDto,
  QuizAttemptSummaryDto,
} from './dto/quiz-attempt.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * Taking a quiz, and looking back at the ones you have taken.
 *
 * Every route here is about the signed-in learner's own attempts — there is no
 * route that reads somebody else's, by design. Reporting across a programme's
 * learners is a separate story with its own aggregated view.
 */
@ApiTags('quizzes')
@ApiBearerAuth()
@Controller()
export class QuizAttemptsController {
  constructor(
    private readonly attempts: QuizAttemptsService,
    private readonly progress: LectureProgressService,
  ) {}

  @Post('lectures/:lectureId/quiz/attempts')
  @ApiOperation({ summary: 'Start a sitting; pre or post is decided here' })
  async start(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptDto> {
    return QuizAttemptDto.from(await this.attempts.start(lectureId, user));
  }

  @Get('lectures/:lectureId/quiz/attempts/open')
  @ApiOperation({ summary: 'The sitting you walked away from, if any' })
  async open(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptDto | null> {
    const attempt = await this.attempts.resumable(lectureId, user);
    return attempt ? QuizAttemptDto.from(attempt) : null;
  }

  @Post('lectures/:lectureId/progress/started')
  @ApiOperation({ summary: 'Opened the lecture' })
  async started(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @CurrentUser() user: User,
  ): Promise<{ startedAt: Date; completedAt: Date | null }> {
    const row = await this.progress.start(lectureId, user);
    return { startedAt: row.startedAt, completedAt: row.completedAt };
  }

  @Post('lectures/:lectureId/progress/completed')
  @ApiOperation({ summary: 'Finished the lecture' })
  async completed(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @CurrentUser() user: User,
  ): Promise<{ startedAt: Date; completedAt: Date | null }> {
    const row = await this.progress.complete(lectureId, user);
    return { startedAt: row.startedAt, completedAt: row.completedAt };
  }

  @Get('me/quiz-attempts')
  @ApiOperation({ summary: 'Your own history, newest first' })
  async history(
    @Query() query: HistoryQueryDto,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptSummaryDto[]> {
    const attempts = await this.attempts.history(user, query);
    return attempts.map(QuizAttemptSummaryDto.from);
  }

  @Get('quiz-attempts/:id')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptDto> {
    return QuizAttemptDto.from(await this.attempts.review(id, user));
  }

  @Patch('quiz-attempts/:id/answer')
  async answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptDto> {
    const attempt = await this.attempts.answer(
      id,
      { sortOrder: dto.sortOrder, chosenIndex: dto.chosenIndex ?? null },
      user,
    );
    return QuizAttemptDto.from(attempt);
  }

  @Post('quiz-attempts/:id/submit')
  @ApiOperation({ summary: 'Mark it; the score comes back with the answers' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<QuizAttemptDto> {
    return QuizAttemptDto.from(await this.attempts.submit(id, user));
  }

  @Delete('quiz-attempts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Throw away a sitting you never submitted' })
  async discard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.attempts.discard(id, user);
  }
}
