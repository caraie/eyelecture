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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizzesService } from './quizzes.service';
import {
  QuizQuestionDto,
  ReorderQuestionsDto,
  SaveQuestionDto,
  SetAvailabilityDto,
} from './dto/quiz.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

const AUTHOR_ROLES = [
  UserRole.SUPER_USER,
  UserRole.PROGRAM_ADMINISTRATOR,
  UserRole.ATTENDING_PHYSICIAN,
  UserRole.FELLOW,
] as const;

/**
 * Writing a lecture's quiz. Everything here shows the right answers, so every
 * route is restricted to the people who may edit the lecture — taking the quiz
 * is a different controller with a different view of the same questions.
 */
@ApiTags('lectures')
@Controller('lectures/:lectureId/quiz')
@UseGuards(RolesGuard)
@ApiBearerAuth()
@Roles(...AUTHOR_ROLES)
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get('questions')
  @ApiOperation({ summary: "The quiz as its author sees it, answers marked" })
  async list(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @CurrentUser() user: User,
  ): Promise<QuizQuestionDto[]> {
    const questions = await this.quizzes.listForAuthor(lectureId, user);
    return questions.map(QuizQuestionDto.from);
  }

  @Post('questions')
  async create(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Body() dto: SaveQuestionDto,
    @CurrentUser() user: User,
  ): Promise<QuizQuestionDto> {
    return QuizQuestionDto.from(
      await this.quizzes.create(lectureId, dto, user),
    );
  }

  @Patch('questions/order')
  @ApiOperation({ summary: 'Reorder the questions, listing them all' })
  async reorder(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: User,
  ): Promise<QuizQuestionDto[]> {
    const questions = await this.quizzes.reorder(lectureId, dto.ids, user);
    return questions.map(QuizQuestionDto.from);
  }

  @Patch('questions/:questionId')
  async update(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveQuestionDto,
    @CurrentUser() user: User,
  ): Promise<QuizQuestionDto> {
    return QuizQuestionDto.from(
      await this.quizzes.update(questionId, dto, user),
    );
  }

  @Delete('questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.quizzes.remove(questionId, user);
  }

  @Patch('availability')
  @ApiOperation({ summary: 'Before the lecture, after it, or both' })
  async setAvailability(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Body() dto: SetAvailabilityDto,
    @CurrentUser() user: User,
  ): Promise<{ availability: string }> {
    const lecture = await this.quizzes.setAvailability(
      lectureId,
      dto.availability,
      user,
    );
    return { availability: lecture.quizAvailability };
  }
}
