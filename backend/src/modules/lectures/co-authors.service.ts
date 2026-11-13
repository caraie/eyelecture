import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Lecture } from './entities/lecture.entity';
import { LectureCoAuthor } from './entities/lecture-co-author.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { MailerService } from '../mail/mailer.service';
import { invitedToCoAuthor } from '../mail/templates';

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const normalize = (email: string): string => email.trim().toLowerCase();

/** The same fortnight an institution invitation gets, for the same reasons. */
const INVITATION_TTL_DAYS = 14;

/** Enough to pick somebody out, few enough to read. */
const SEARCH_LIMIT = 10;

@Injectable()
export class CoAuthorsService {
  private readonly logger = new Logger(CoAuthorsService.name);

  constructor(
    @InjectRepository(LectureCoAuthor)
    private readonly coAuthors: Repository<LectureCoAuthor>,
    @InjectRepository(Lecture)
    private readonly lectures: Repository<Lecture>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  /** Everybody still credited on the lecture, invitations included. */
  async list(lectureId: string): Promise<LectureCoAuthor[]> {
    return this.coAuthors.find({
      where: { lectureId, revokedAt: IsNull() },
      relations: { user: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async listFor(lectureIds: string[]): Promise<Map<string, LectureCoAuthor[]>> {
    const byLecture = new Map<string, LectureCoAuthor[]>();
    if (!lectureIds.length) return byLecture;

    const rows = await this.coAuthors.find({
      where: { lectureId: In(lectureIds), revokedAt: IsNull() },
      relations: { user: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    for (const row of rows) {
      byLecture.set(row.lectureId, [
        ...(byLecture.get(row.lectureId) ?? []),
        row,
      ]);
    }
    return byLecture;
  }

  /**
   * People to pick from, by name or address.
   *
   * Only accounts that have finished signing up: a half-made one has no name
   * to put on a chip, and crediting it would be crediting nobody. The search
   * matches an address but never shows one back — a directory lookup is not a
   * way to harvest the mailbox of every doctor on the platform.
   */
  async search(term: string, asking: User): Promise<User[]> {
    const text = term.trim();
    if (text.length < 2) return [];

    const like = `%${text}%`;
    const found = await this.users.find({
      where: [
        { firstName: ILike(like), status: UserStatus.ACTIVE },
        { lastName: ILike(like), status: UserStatus.ACTIVE },
        { email: ILike(like), status: UserStatus.ACTIVE },
        { personalEmail: ILike(like), status: UserStatus.ACTIVE },
      ],
      relations: { institution: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
      take: SEARCH_LIMIT + 1,
    });

    return found.filter((user) => user.id !== asking.id).slice(0, SEARCH_LIMIT);
  }

  /** Add somebody who already has an account. */
  async add(
    lectureId: string,
    userId: string,
    editor: User,
  ): Promise<LectureCoAuthor[]> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayManage(lecture, editor);

    if (userId === lecture.authorId) {
      throw new BadRequestException(
        'They are already the author of this lecture',
      );
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('That person was not found');

    const existing = await this.coAuthors.findOne({
      where: { lectureId, userId, revokedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('They are already credited on this lecture');
    }

    // A pending invitation to the same person's address becomes the real thing
    // rather than sitting next to it as a second chip.
    const pending = await this.pendingFor(lectureId, user);
    if (pending) {
      pending.userId = user.id;
      pending.acceptedAt = new Date();
      pending.tokenHash = null;
      await this.coAuthors.save(pending);
      return this.list(lectureId);
    }

    await this.coAuthors.save(
      this.coAuthors.create({
        lectureId,
        userId: user.id,
        email: user.email ?? user.personalEmail ?? null,
        acceptedAt: new Date(),
        invitedById: editor.id,
        sortOrder: await this.nextOrder(lectureId),
      }),
    );

    return this.list(lectureId);
  }

  /**
   * Write to somebody who is not on the platform yet.
   *
   * An address that already belongs to an account is added outright instead —
   * sending a "set up an account" mail to somebody who has one is the dead end
   * this story exists to remove.
   */
  async invite(
    lectureId: string,
    rawEmail: string,
    invitedName: string | null,
    editor: User,
  ): Promise<{ coAuthors: LectureCoAuthor[]; link: string | null }> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayManage(lecture, editor);

    const email = normalize(rawEmail);
    const known = await this.userByAnyEmail(email);
    if (known) {
      return { coAuthors: await this.add(lectureId, known.id, editor), link: null };
    }

    const existing = await this.coAuthors.findOne({
      where: {
        lectureId,
        email,
        userId: IsNull(),
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      },
    });
    if (existing?.isPending) {
      throw new ConflictException(
        'That address already has an invitation waiting. Resend it instead.',
      );
    }
    if (existing) {
      // Stale rather than live: it still occupies the unique index, which knows
      // nothing about the clock, so it is withdrawn to make room.
      await this.coAuthors.update({ id: existing.id }, { revokedAt: new Date() });
    }

    const token = randomBytes(32).toString('hex');
    await this.coAuthors.save(
      this.coAuthors.create({
        lectureId,
        userId: null,
        email,
        invitedName: invitedName?.trim() || null,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        invitedById: editor.id,
        sortOrder: await this.nextOrder(lectureId),
      }),
    );

    const link = await this.send(lecture, email, token, editor);
    return { coAuthors: await this.list(lectureId), link };
  }

  /** Send it again, with a fresh token and a fresh fortnight. */
  async resend(
    lectureId: string,
    coAuthorId: string,
    editor: User,
  ): Promise<{ coAuthors: LectureCoAuthor[]; link: string | null }> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayManage(lecture, editor);

    const row = await this.findRow(lectureId, coAuthorId);
    if (row.userId || row.acceptedAt || row.revokedAt || !row.email) {
      throw new BadRequestException('There is no invitation waiting for them');
    }

    const token = randomBytes(32).toString('hex');
    row.tokenHash = hashToken(token);
    row.expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
    await this.coAuthors.save(row);

    const link = await this.send(lecture, row.email, token, editor);
    return { coAuthors: await this.list(lectureId), link };
  }

  /**
   * Take somebody off, or withdraw an invitation.
   *
   * The row is marked rather than deleted: who was once credited on a lecture
   * is a question somebody asks later, and the partial indexes only cover rows
   * that are still standing, so the same person can be added again.
   */
  async remove(
    lectureId: string,
    coAuthorId: string,
    editor: User,
  ): Promise<LectureCoAuthor[]> {
    const lecture = await this.findLecture(lectureId);
    this.assertMayManage(lecture, editor);

    const row = await this.findRow(lectureId, coAuthorId);
    if (!row.revokedAt) {
      await this.coAuthors.update({ id: row.id }, { revokedAt: new Date() });
    }

    return this.list(lectureId);
  }

  /**
   * Called when somebody finishes signing up: any lecture they were written to
   * about now carries their account instead of their address.
   *
   * By address rather than by token, so it works whether they followed the link
   * or simply signed up on their own with the address they were written to.
   * Quiet about what it found — this runs inside registration, and a co-author
   * row is not a reason for that to fail.
   */
  async claimInvitations(user: User): Promise<number> {
    const addresses = [user.email, user.personalEmail]
      .filter((address): address is string => Boolean(address))
      .map(normalize);
    if (!addresses.length) return 0;

    const pending = await this.coAuthors.find({
      where: addresses.map((email) => ({
        email,
        userId: IsNull(),
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      })),
    });

    let claimed = 0;
    for (const row of pending) {
      if (!row.isPending) continue;

      // Somebody may already be credited directly — in which case the
      // invitation is simply spent, not duplicated.
      const already = await this.coAuthors.findOne({
        where: { lectureId: row.lectureId, userId: user.id, revokedAt: IsNull() },
      });

      row.acceptedAt = new Date();
      row.tokenHash = null;
      if (already) {
        row.revokedAt = new Date();
      } else {
        row.userId = user.id;
        claimed += 1;
      }
      await this.coAuthors.save(row);
    }

    if (claimed) {
      this.logger.log(`Linked ${claimed} co-author credit(s) to a new account`);
    }
    return claimed;
  }

  // --- Helpers ----------------------------------------------------------------

  private async send(
    lecture: Lecture,
    email: string,
    token: string,
    editor: User,
  ): Promise<string> {
    const link = `${this.config.getOrThrow<string>(
      'app.frontendUrl',
    )}/auth/register?coAuthor=${token}`;

    // Unlike the institution invitation, this link creates nothing on its own —
    // it credits an account the person still has to make — so logging it off
    // production is the whole development flow and costs nothing.
    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.logger.log(`Co-author link for ${email} (${lecture.title}): ${link}`);
    }

    const name = `${editor.firstName} ${editor.lastName}`.trim();
    await this.mailer.send(
      { to: email, ...invitedToCoAuthor(lecture.title, name, link, INVITATION_TTL_DAYS) },
      `co-author invitation (${lecture.title})`,
    );

    return link;
  }

  private async userByAnyEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: [{ email }, { personalEmail: email }],
    });
  }

  private async pendingFor(
    lectureId: string,
    user: User,
  ): Promise<LectureCoAuthor | null> {
    const addresses = [user.email, user.personalEmail]
      .filter((address): address is string => Boolean(address))
      .map(normalize);
    if (!addresses.length) return null;

    const row = await this.coAuthors.findOne({
      where: addresses.map((email) => ({
        lectureId,
        email,
        userId: IsNull(),
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      })),
    });
    return row?.isPending ? row : null;
  }

  private async nextOrder(lectureId: string): Promise<number> {
    return this.coAuthors.count({
      where: { lectureId, revokedAt: IsNull() },
    });
  }

  private async findRow(
    lectureId: string,
    id: string,
  ): Promise<LectureCoAuthor> {
    const row = await this.coAuthors.findOne({ where: { id, lectureId } });
    if (!row) throw new NotFoundException('That co-author was not found');
    return row;
  }

  private async findLecture(id: string): Promise<Lecture> {
    const lecture = await this.lectures.findOne({ where: { id } });
    if (!lecture) throw new NotFoundException('That lecture was not found');
    return lecture;
  }

  /**
   * Who may change the list of credited people: the author, and the
   * administrators. Deliberately *not* the co-authors themselves — being
   * credited on a lecture does not let you decide who else is, which is what
   * keeps one person from quietly rewriting its authorship.
   */
  private assertMayManage(lecture: Lecture, user: User): void {
    const mayManage =
      user.role === UserRole.SUPER_USER ||
      lecture.authorId === user.id ||
      (user.role === UserRole.PROGRAM_ADMINISTRATOR &&
        lecture.institutionId !== null &&
        lecture.institutionId === user.institutionId);

    if (!mayManage) {
      throw new NotFoundException('That lecture was not found');
    }
  }
}
