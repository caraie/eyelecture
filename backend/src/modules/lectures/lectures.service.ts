import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Lecture } from './entities/lecture.entity';
import { LectureAsset } from './entities/lecture-asset.entity';
import { LectureCoAuthor } from './entities/lecture-co-author.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { Subsection } from '../lecture-bank/entities/subsection.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LectureAssetKind } from './enums/lecture-asset-kind.enum';
import { LectureStatus } from './enums/lecture-status.enum';
import { LectureVisibility } from './enums/lecture-visibility.enum';
import { StorageService, UploadTicket } from '../storage/storage.service';
import {
  CreateLectureDto,
  RequestUploadDto,
  UpdateLectureDto,
} from './dto/lecture.dto';

/**
 * What each kind of file may be, and how big.
 *
 * Presentations are PDF only for now. The old app took .ppt and .pptx, and the
 * story asks for them, but a browser cannot display either — showing one inside
 * the app means converting it to PDF or to images on the server, which is a
 * LibreOffice-sized piece of infrastructure and its own ticket. PDF is the
 * subset that works today end to end, and "export to PDF" is one menu item away
 * in PowerPoint and Keynote.
 */
const RULES: Record<
  LectureAssetKind,
  { types: string[]; maxBytes: number; label: string }
> = {
  [LectureAssetKind.PRESENTATION]: {
    types: ['application/pdf'],
    maxBytes: 200 * 1024 * 1024,
    label: 'a PDF',
  },
  [LectureAssetKind.VIDEO]: {
    types: ['video/mp4', 'video/quicktime'],
    maxBytes: 5 * 1024 * 1024 * 1024,
    label: 'an MP4 or MOV video',
  },
  [LectureAssetKind.TILE]: {
    types: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * 1024 * 1024,
    label: 'a JPEG, PNG or WebP image',
  },
};

@Injectable()
export class LecturesService {
  constructor(
    @InjectRepository(Lecture)
    private readonly lectures: Repository<Lecture>,
    @InjectRepository(LectureAsset)
    private readonly assets: Repository<LectureAsset>,
    @InjectRepository(Subsection)
    private readonly subsections: Repository<Subsection>,
    @InjectRepository(QuizQuestion)
    private readonly questions: Repository<QuizQuestion>,
    @InjectRepository(LectureCoAuthor)
    private readonly coAuthors: Repository<LectureCoAuthor>,
    private readonly storage: StorageService,
  ) {}

  // --- Reading ----------------------------------------------------------------

  /**
   * What a learner sees: published lectures only, and of those, the ones their
   * institution is allowed to see. An author's own drafts are deliberately not
   * mixed in — the bank is the published library, and the drafts live on the
   * author's own screen.
   */
  async findPublished(
    viewer: User,
    filter: { subsectionId?: string; sectionId?: string } = {},
  ): Promise<Lecture[]> {
    const query = this.lectures
      .createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.assets', 'asset')
      .leftJoinAndSelect('lecture.author', 'author')
      .leftJoinAndSelect('lecture.institution', 'institution')
      .innerJoin('lecture.subsection', 'subsection')
      .where('lecture.status = :status', { status: LectureStatus.PUBLISHED })
      .orderBy('lecture.publishedAt', 'DESC');

    if (filter.subsectionId) {
      query.andWhere('lecture.subsectionId = :subsectionId', {
        subsectionId: filter.subsectionId,
      });
    } else if (filter.sectionId) {
      query.andWhere('subsection.sectionId = :sectionId', {
        sectionId: filter.sectionId,
      });
    }

    // A lecture kept for one institution is visible to that institution and to
    // the platform's own staff, who have to be able to see what is on the
    // platform in order to run it.
    if (viewer.role !== UserRole.SUPER_USER) {
      query.andWhere(
        '(lecture.visibility = :open OR lecture.institutionId = :institutionId)',
        {
          open: LectureVisibility.ALL_INSTITUTIONS,
          institutionId: viewer.institutionId ?? null,
        },
      );
    }

    return this.withQuestionCounts(await query.getMany());
  }

  /**
   * Fills in `questionCount` for a list of lectures with one grouped query.
   *
   * The alternative — a count per lecture, or joining the questions in — is
   * either N+1 or dragging every option of every question across the wire so a
   * card can print a number.
   */
  private async withQuestionCounts(lectures: Lecture[]): Promise<Lecture[]> {
    if (lectures.length === 0) return lectures;

    const rows = await this.questions
      .createQueryBuilder('question')
      .select('question."lectureId"', 'lectureId')
      .addSelect('COUNT(*)', 'count')
      .where('question."lectureId" IN (:...ids)', {
        ids: lectures.map((lecture) => lecture.id),
      })
      .groupBy('question."lectureId"')
      .getRawMany<{ lectureId: string; count: string }>();

    const counts = new Map(rows.map((row) => [row.lectureId, Number(row.count)]));
    for (const lecture of lectures) {
      lecture.questionCount = counts.get(lecture.id) ?? 0;
    }
    return this.withCoAuthors(lectures);
  }

  /**
   * Fills in `coAuthors`, again with one query for the whole list rather than
   * one per lecture. Withdrawn credits are left out; outstanding invitations
   * are not, because the chip that says "Invited" is the point of them.
   */
  private async withCoAuthors(lectures: Lecture[]): Promise<Lecture[]> {
    if (lectures.length === 0) return lectures;

    const rows = await this.coAuthors.find({
      where: {
        lectureId: In(lectures.map((lecture) => lecture.id)),
        revokedAt: IsNull(),
      },
      relations: { user: { institution: true } },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const byLecture = new Map<string, LectureCoAuthor[]>();
    for (const row of rows) {
      byLecture.set(row.lectureId, [...(byLecture.get(row.lectureId) ?? []), row]);
    }
    for (const lecture of lectures) {
      lecture.coAuthors = byLecture.get(lecture.id) ?? [];
    }
    return lectures;
  }

  /** The author's own lectures, drafts included. */
  async findMine(author: User): Promise<Lecture[]> {
    return this.withQuestionCounts(
      await this.lectures.find({
        where: { authorId: author.id },
        relations: { assets: true, author: true, institution: true },
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async findOneFor(id: string, viewer: User): Promise<Lecture> {
    const lecture = await this.lectures.findOne({
      where: { id },
      relations: { assets: true, author: true, institution: true },
    });
    if (!lecture) throw new NotFoundException('That lecture was not found');

    if (lecture.status === LectureStatus.DRAFT && !this.mayEdit(lecture, viewer)) {
      // Not 403: a draft should not be discoverable by poking at ids.
      throw new NotFoundException('That lecture was not found');
    }
    if (
      lecture.status === LectureStatus.PUBLISHED &&
      lecture.visibility === LectureVisibility.OWN_INSTITUTION &&
      viewer.role !== UserRole.SUPER_USER &&
      lecture.institutionId !== viewer.institutionId &&
      !this.mayEdit(lecture, viewer)
    ) {
      throw new NotFoundException('That lecture was not found');
    }

    const [withEverything] = await this.withQuestionCounts([lecture]);
    return withEverything;
  }

  // --- Writing ----------------------------------------------------------------

  async create(dto: CreateLectureDto, author: User): Promise<Lecture> {
    await this.findSubsection(dto.subsectionId);

    const lecture = await this.lectures.save(
      this.lectures.create({
        subsectionId: dto.subsectionId,
        title: dto.title,
        objectives: dto.objectives ?? null,
        keywords: dto.keywords ?? [],
        visibility: dto.visibility ?? LectureVisibility.ALL_INSTITUTIONS,
        authorId: author.id,
        // Captured now rather than read from the author later: somebody who
        // moves institutions does not take their published lectures with them.
        institutionId: author.institutionId ?? null,
        status: LectureStatus.DRAFT,
      }),
    );

    return this.findOrFail(lecture.id);
  }

  async update(id: string, dto: UpdateLectureDto, editor: User): Promise<Lecture> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    if (dto.subsectionId && dto.subsectionId !== lecture.subsectionId) {
      await this.findSubsection(dto.subsectionId);
      lecture.subsectionId = dto.subsectionId;
    }
    if (dto.title !== undefined) lecture.title = dto.title;
    if (dto.objectives !== undefined) lecture.objectives = dto.objectives ?? null;
    if (dto.keywords !== undefined) lecture.keywords = dto.keywords;
    if (dto.visibility !== undefined) lecture.visibility = dto.visibility;

    await this.lectures.save(lecture);
    return this.findOrFail(id);
  }

  /**
   * Publishing is the one transition with a precondition: a lecture is a
   * presentation, so without one there is nothing to publish. The video is
   * optional and stays optional.
   */
  async publish(id: string, editor: User): Promise<Lecture> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    const presentation = lecture.assets?.find(
      (asset) =>
        asset.kind === LectureAssetKind.PRESENTATION && asset.uploadedAt !== null,
    );
    if (!presentation) {
      throw new ConflictException(
        'Upload the presentation before publishing — it is what learners read.',
      );
    }

    lecture.status = LectureStatus.PUBLISHED;
    lecture.publishedAt = lecture.publishedAt ?? new Date();
    await this.lectures.save(lecture);
    return this.findOrFail(id);
  }

  async unpublish(id: string, editor: User): Promise<Lecture> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    lecture.status = LectureStatus.DRAFT;
    await this.lectures.save(lecture);
    return this.findOrFail(id);
  }

  async remove(id: string, editor: User): Promise<void> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    // The rows cascade; the objects do not. Postgres cannot reach into the
    // bucket, so the files go first and by hand.
    for (const asset of lecture.assets ?? []) {
      await this.storage.remove(asset.objectKey);
    }
    await this.lectures.delete({ id });
  }

  // --- Files ------------------------------------------------------------------

  /**
   * Step one of an upload: check what they say they are sending, decide where
   * it goes, and hand back a URL the browser may PUT to. The row is written
   * now, with no `uploadedAt`, so that step two has something to confirm.
   */
  async requestUpload(
    id: string,
    kind: LectureAssetKind,
    dto: RequestUploadDto,
    editor: User,
  ): Promise<UploadTicket> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    const rules = RULES[kind];
    if (!rules.types.includes(dto.contentType)) {
      throw new BadRequestException(
        `The ${kind} has to be ${rules.label}. That file is ${dto.contentType}.`,
      );
    }
    if (dto.sizeBytes > rules.maxBytes) {
      throw new BadRequestException(
        `That file is larger than the ${this.megabytes(rules.maxBytes)} limit for ${kind}s.`,
      );
    }

    // The key is ours, never the client's: a name that came off the browser
    // could walk out of the lecture's own folder. The original name is kept as
    // a column, which is all it is needed for.
    const objectKey = `lectures/${lecture.id}/${kind}/${randomUUID()}${extname(dto.fileName).slice(0, 10)}`;
    const ticket = await this.storage.uploadUrl(objectKey, dto.contentType);

    const existing = await this.assets.findOne({
      where: { lectureId: id, kind },
    });
    if (existing) {
      // Replacing: the old object is only deleted once the new one is
      // confirmed, so a failed upload leaves the lecture as it was.
      existing.objectKey = objectKey;
      existing.fileName = dto.fileName;
      existing.contentType = dto.contentType;
      existing.sizeBytes = String(dto.sizeBytes);
      existing.uploadedAt = null;
      await this.assets.save(existing);
    } else {
      await this.assets.save(
        this.assets.create({
          lectureId: id,
          kind,
          objectKey,
          fileName: dto.fileName,
          contentType: dto.contentType,
          sizeBytes: String(dto.sizeBytes),
          uploadedAt: null,
        }),
      );
    }

    return ticket;
  }

  /**
   * Step two: the browser says it finished. We check the bucket rather than
   * taking its word — a lecture pointing at an object that was never written
   * is worse than an upload the author can simply retry.
   */
  async confirmUpload(
    id: string,
    kind: LectureAssetKind,
    editor: User,
  ): Promise<Lecture> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    const asset = await this.assets.findOne({ where: { lectureId: id, kind } });
    if (!asset) throw new NotFoundException('No upload was started for that file');

    const stored = await this.storage.stat(asset.objectKey);
    if (!stored) {
      throw new ConflictException(
        'That file did not arrive. Try the upload again.',
      );
    }

    asset.sizeBytes = String(stored.size);
    asset.uploadedAt = new Date();
    await this.assets.save(asset);

    return this.findOrFail(id);
  }

  async removeAsset(
    id: string,
    kind: LectureAssetKind,
    editor: User,
  ): Promise<Lecture> {
    const lecture = await this.findOrFail(id);
    this.assertMayEdit(lecture, editor);

    if (kind === LectureAssetKind.PRESENTATION && lecture.status === LectureStatus.PUBLISHED) {
      throw new ConflictException(
        'A published lecture needs its presentation. Unpublish it first, or replace the file instead.',
      );
    }

    const asset = await this.assets.findOne({ where: { lectureId: id, kind } });
    if (!asset) return lecture;

    await this.storage.remove(asset.objectKey);
    await this.assets.delete({ id: asset.id });
    return this.findOrFail(id);
  }

  /** A short-lived link to read one file. This is how the viewer gets its bytes. */
  async fileUrl(
    id: string,
    kind: LectureAssetKind,
    viewer: User,
  ): Promise<{ url: string; contentType: string }> {
    const lecture = await this.findOneFor(id, viewer);

    const asset = lecture.assets?.find(
      (candidate) => candidate.kind === kind && candidate.uploadedAt !== null,
    );
    if (!asset) throw new NotFoundException('This lecture has no such file');

    return {
      url: await this.storage.readUrl(asset.objectKey, asset.fileName),
      contentType: asset.contentType,
    };
  }

  // --- Guards -----------------------------------------------------------------

  /**
   * The author, and the administrators. Co-authors arrive in EYE-5 and will be
   * one more clause here — the reason this is a method rather than a line
   * repeated through the service.
   */
  private mayEdit(lecture: Lecture, user: User): boolean {
    if (user.role === UserRole.SUPER_USER) return true;
    if (lecture.authorId === user.id) return true;
    return (
      user.role === UserRole.PROGRAM_ADMINISTRATOR &&
      lecture.institutionId !== null &&
      lecture.institutionId === user.institutionId
    );
  }

  private assertMayEdit(lecture: Lecture, user: User): void {
    if (!this.mayEdit(lecture, user)) {
      throw new ForbiddenException('This lecture is not yours to edit');
    }
  }

  private async findOrFail(id: string): Promise<Lecture> {
    const lecture = await this.lectures.findOne({
      where: { id },
      relations: { assets: true, author: true, institution: true },
    });
    if (!lecture) throw new NotFoundException('That lecture was not found');

    const [withCount] = await this.withQuestionCounts([lecture]);
    return withCount;
  }

  private async findSubsection(id: string): Promise<Subsection> {
    const subsection = await this.subsections.findOne({ where: { id } });
    if (!subsection) {
      throw new NotFoundException('That subsection was not found');
    }
    return subsection;
  }

  private megabytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${Math.round(mb)} MB`;
  }
}
