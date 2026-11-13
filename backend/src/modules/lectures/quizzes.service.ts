import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lecture } from './entities/lecture.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { QuizAvailability } from './enums/quiz-availability.enum';
import { SaveQuestionDto } from './dto/quiz.dto';

/** What a question has to look like before it can be saved. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

@Injectable()
export class QuizzesService {
  constructor(
    @InjectRepository(Lecture)
    private readonly lectures: Repository<Lecture>,
    @InjectRepository(QuizQuestion)
    private readonly questions: Repository<QuizQuestion>,
    @InjectRepository(QuizOption)
    private readonly options: Repository<QuizOption>,
  ) {}

  /**
   * The questions as their author sees them — with the right answers marked.
   * What a *learner* sees is built in EYE-4 and deliberately leaves those out.
   */
  async listForAuthor(lectureId: string, editor: User): Promise<QuizQuestion[]> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayEdit(lecture, editor);

    return this.questions.find({
      where: { lectureId },
      relations: { options: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async create(
    lectureId: string,
    dto: SaveQuestionDto,
    editor: User,
  ): Promise<QuizQuestion> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayEdit(lecture, editor);
    this.assertValid(dto);

    const highest = await this.highestOrder(lectureId);
    const question = await this.questions.save(
      this.questions.create({
        lectureId,
        prompt: dto.prompt,
        explanation: dto.explanation ?? null,
        sortOrder: highest + 1,
        options: dto.options.map((option, index) =>
          this.options.create({
            text: option.text,
            isCorrect: option.isCorrect,
            sortOrder: index,
          }),
        ),
      }),
    );

    return this.findQuestion(question.id);
  }

  /**
   * Replaces the question and its options wholesale rather than diffing them.
   *
   * The options have no meaning apart from their question — nothing points at
   * an option id but the question itself, and a learner's past attempt keeps
   * its own snapshot of what was asked. So rewriting the set is simpler than
   * matching rows up, and it cannot leave a half-updated question behind.
   */
  async update(
    questionId: string,
    dto: SaveQuestionDto,
    editor: User,
  ): Promise<QuizQuestion> {
    const question = await this.findQuestion(questionId);
    const lecture = await this.findLecture(question.lectureId);
    this.assertMayEdit(lecture, editor);
    this.assertValid(dto);

    question.prompt = dto.prompt;
    question.explanation = dto.explanation ?? null;
    await this.questions.save(question);

    await this.options.delete({ questionId });
    await this.options.save(
      dto.options.map((option, index) =>
        this.options.create({
          questionId,
          text: option.text,
          isCorrect: option.isCorrect,
          sortOrder: index,
        }),
      ),
    );

    return this.findQuestion(questionId);
  }

  async remove(questionId: string, editor: User): Promise<void> {
    const question = await this.findQuestion(questionId);
    const lecture = await this.findLecture(question.lectureId);
    this.assertMayEdit(lecture, editor);

    await this.questions.delete({ id: questionId });
  }

  /** The whole list in its new order, like the lecture bank's reordering. */
  async reorder(
    lectureId: string,
    ids: string[],
    editor: User,
  ): Promise<QuizQuestion[]> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayEdit(lecture, editor);

    const existing = await this.questions.find({ where: { lectureId } });
    const given = new Set(ids);
    if (
      given.size !== ids.length ||
      given.size !== existing.length ||
      existing.some((question) => !given.has(question.id))
    ) {
      throw new BadRequestException(
        'The new order must list every question of this lecture, and nothing else',
      );
    }

    await this.questions.manager.transaction(async (manager) => {
      await Promise.all(
        ids.map((id, index) =>
          manager.update(QuizQuestion, { id }, { sortOrder: index }),
        ),
      );
    });

    return this.listForAuthor(lectureId, editor);
  }

  async setAvailability(
    lectureId: string,
    availability: QuizAvailability,
    editor: User,
  ): Promise<Lecture> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayEdit(lecture, editor);

    lecture.quizAvailability = availability;
    await this.lectures.save(lecture);
    return lecture;
  }

  /** How many questions a lecture has. Zero means it has no quiz at all. */
  async countFor(lectureId: string): Promise<number> {
    return this.questions.count({ where: { lectureId } });
  }

  // --- Rules ------------------------------------------------------------------

  /**
   * Everything a question must be, in one place: something to ask, between two
   * and six things to pick from, and exactly one of them right.
   *
   * "Exactly one" is not a database constraint on purpose. A unique partial
   * index could say "at most one correct per question", but it could not say
   * "at least one" without also forbidding the moment mid-edit when a question
   * has none. The rule belongs where the whole set is visible at once.
   */
  private assertValid(dto: SaveQuestionDto): void {
    if (!dto.prompt?.trim()) {
      throw new BadRequestException('A question needs something to ask');
    }

    const options = dto.options ?? [];
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      throw new BadRequestException(
        `A question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} answers to pick from`,
      );
    }
    if (options.some((option) => !option.text?.trim())) {
      throw new BadRequestException('Every answer needs text');
    }

    const correct = options.filter((option) => option.isCorrect).length;
    if (correct !== 1) {
      throw new BadRequestException(
        correct === 0
          ? 'Mark the correct answer'
          : 'Only one answer can be the correct one',
      );
    }
  }

  private async highestOrder(lectureId: string): Promise<number> {
    const row = await this.questions
      .createQueryBuilder('question')
      .select('COALESCE(MAX(question."sortOrder"), -1)', 'max')
      .where('question."lectureId" = :lectureId', { lectureId })
      .getRawOne<{ max: string }>();
    return Number(row?.max ?? -1);
  }

  private async findQuestion(id: string): Promise<QuizQuestion> {
    const question = await this.questions.findOne({
      where: { id },
      relations: { options: true },
      order: { options: { sortOrder: 'ASC' } },
    });
    if (!question) throw new NotFoundException('That question was not found');
    return question;
  }

  private async findLecture(id: string): Promise<Lecture> {
    const lecture = await this.lectures.findOne({ where: { id } });
    if (!lecture) throw new NotFoundException('That lecture was not found');
    return lecture;
  }

  /** The same rule the lectures service uses — author, or the administrators. */
  private assertMayEdit(lecture: Lecture, user: User): void {
    const mayEdit =
      user.role === UserRole.SUPER_USER ||
      lecture.authorId === user.id ||
      (user.role === UserRole.PROGRAM_ADMINISTRATOR &&
        lecture.institutionId !== null &&
        lecture.institutionId === user.institutionId);

    if (!mayEdit) {
      throw new ForbiddenException('This lecture is not yours to edit');
    }
  }
}
