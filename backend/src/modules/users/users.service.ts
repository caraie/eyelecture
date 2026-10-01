import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { User } from './entities/user.entity';
import { UserAffiliation } from './entities/user-affiliation.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from './enums/validation-status.enum';
import { QueryUsersDto } from './dto/query-users.dto';
import { RejectUserDto, ValidateUserDto } from './dto/validate-user.dto';
import { UpdateProfileDto } from './dto/update-user.dto';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import { InstitutionsService } from '../institutions/institutions.service';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity';
import { VerificationPurpose } from '../auth/enums/verification-purpose.enum';

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const emailDomainOf = (email: string): string => {
  const at = normalizeEmail(email).lastIndexOf('@');
  return at === -1 ? '' : normalizeEmail(email).slice(at + 1);
};

/**
 * Compares two user ids case-insensitively.
 *
 * ParseUUIDPipe accepts a UUID in any case and hands it through unchanged, while
 * Postgres compares the `uuid` type case-insensitively — so `AB12…` and `ab12…` are
 * one row to the database but two different strings to `===`. Every "is this you?"
 * guard has to go through here. Otherwise an admin can defeat the self-delete
 * safeguard by upper-casing their own id in the URL.
 */
export const isSameUser = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

const RELATIONS = {
  institution: true,
  requestedInstitution: true,
  trainingLevel: true,
  specialty: true,
  residencyProgram: true,
  fellowshipProgram: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    // Not owned by this module, but an admin changing someone's main address has to
    // invalidate any link issued for the old one in the same operation. Reaching for
    // AuthService instead would mean UsersModule and AuthModule importing each other.
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokens: Repository<EmailVerificationToken>,
    @InjectRepository(UserAffiliation)
    private readonly affiliations: Repository<UserAffiliation>,
    private readonly institutions: InstitutionsService,
  ) {}

  // --- Reads ------------------------------------------------------------------

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id }, relations: RELATIONS });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * One account, as far as the viewer is allowed to see it.
   *
   * A program administrator who asks for somebody outside their institution is told
   * the account does not exist rather than that they may not look at it: a 403 here
   * would confirm the id belongs to a real person, which is exactly the fact being
   * withheld. Someone who asked to join their institution is in scope — they have to
   * be, or the queue would list people the administrator cannot open.
   */
  async findByIdFor(id: string, viewer: User): Promise<User> {
    const user = await this.findByIdOrFail(id);
    if (viewer.role !== UserRole.PROGRAM_ADMINISTRATOR) return user;

    const inScope =
      isSameUser(user.id, viewer.id) ||
      (viewer.institutionId !== null &&
        (user.institutionId === viewer.institutionId ||
          user.requestedInstitutionId === viewer.institutionId));

    if (!inScope) throw new NotFoundException('User not found');
    return user;
  }

  /** Primary address only. Used where the institutional address is what matters. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: normalizeEmail(email) },
      relations: RELATIONS,
    });
  }

  /**
   * Sign-in lookup. Case-insensitive, matching the `LOWER("username")` index —
   * otherwise the account somebody created as "Ana.Perez" refuses the "ana.perez"
   * they will type tomorrow.
   *
   * Includes the password hash, which is `select: false` on the entity.
   */
  findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.institution', 'institution')
      .leftJoinAndSelect('user.requestedInstitution', 'requestedInstitution')
      .where('LOWER(user.username) = LOWER(:username)', {
        username: username.trim(),
      })
      .getOne();
  }

  /** Case-insensitive, for the same reason the lookup above is. */
  async usernameInUse(username: string, exceptUserId?: string): Promise<boolean> {
    const query = this.users
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', {
        username: username.trim(),
      });

    if (exceptUserId) {
      query.andWhere('user.id <> :exceptUserId', { exceptUserId });
    }

    return (await query.getCount()) > 0;
  }

  /** For verifying a password the caller supplied, e.g. before changing it. */
  findByIdWithPassword(id: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  /**
   * Is this address taken by anybody, as either of their two addresses?
   *
   * Checking both columns is the point. A unique index per column would still let one
   * person's personal address equal another's institutional one, and then sign-in has
   * two candidate accounts and no way to choose.
   *
   * `exceptUserId` lets someone re-submit their own address without tripping over
   * themselves when editing.
   */
  async emailInUse(email: string, exceptUserId?: string): Promise<boolean> {
    const normalized = normalizeEmail(email);
    const qb = this.users
      .createQueryBuilder('user')
      .where('(user.email = :email OR user.personalEmail = :email)', {
        email: normalized,
      });

    if (exceptUserId) {
      qb.andWhere('user.id != :exceptUserId', { exceptUserId });
    }

    return (await qb.getCount()) > 0;
  }

  /**
   * Everybody, or everybody at one institution.
   *
   * `viewer` is what scopes it. A super user works across the platform and sees all
   * of it; a program administrator administers exactly one institution, so that is
   * the list they get — and an unaffiliated one gets nothing rather than everything,
   * which is the safe direction for a missing institutionId to fail in.
   */
  async findAll(
    query: QueryUsersDto,
    viewer?: User,
  ): Promise<PaginatedResult<User>> {
    if (viewer?.role === UserRole.PROGRAM_ADMINISTRATOR) {
      if (!viewer.institutionId) return paginate([], 0, query);
      // Overwrites rather than narrows any institutionId the caller passed: the
      // parameter is a filter for a super user, not a way to look elsewhere.
      query.institutionId = viewer.institutionId;
    }

    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.institution', 'institution')
      .leftJoinAndSelect('user.requestedInstitution', 'requestedInstitution')
      .orderBy('user.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.role) qb.andWhere('user.role = :role', { role: query.role });
    if (query.status)
      qb.andWhere('user.status = :status', { status: query.status });
    if (query.validationStatus) {
      qb.andWhere('user.validationStatus = :validationStatus', {
        validationStatus: query.validationStatus,
      });
    }
    if (query.institutionId) {
      qb.andWhere('user.institutionId = :institutionId', {
        institutionId: query.institutionId,
      });
    }
    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(user.username) LIKE :term', { term })
            .orWhere('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.personalEmail) LIKE :term', { term })
            .orWhere('LOWER(user.firstName) LIKE :term', { term })
            .orWhere('LOWER(user.lastName) LIKE :term', { term });
        }),
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  /**
   * The validation queue, scoped to what the caller is allowed to act on.
   *
   * A program administrator sees everyone who either already resolved to their
   * institution or explicitly asked to join it — trainees, attending physicians and
   * other program administrators alike. An admin sees everything still pending,
   * including signups with no institution at all.
   */
  async findPendingValidation(
    reviewer: User,
    query: QueryUsersDto,
  ): Promise<PaginatedResult<User>> {
    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.institution', 'institution')
      .leftJoinAndSelect('user.requestedInstitution', 'requestedInstitution')
      .where('user.validationStatus = :pending', {
        pending: ValidationStatus.PENDING,
      })
      .andWhere('user.id != :reviewerId', { reviewerId: reviewer.id })
      .orderBy('user.createdAt', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    if (reviewer.role === UserRole.PROGRAM_ADMINISTRATOR) {
      // Same rule as assertCanReview: an unapproved administrator has no queue.
      // Showing them one and refusing every action would only look broken.
      if (!reviewer.institutionId || !reviewer.isValidated) {
        return paginate([], 0, query);
      }
      // Everyone except platform staff, who are only ever approved by another
      // super user. The first program administrator at an institution still cannot
      // appear here, because reaching this branch already requires a validated
      // administrator at that institution — see assertCanReview.
      qb.andWhere('user.role != :superUser', {
        superUser: UserRole.SUPER_USER,
      });
      qb.andWhere(
        new Brackets((w) => {
          w.where('user.institutionId = :institutionId', {
            institutionId: reviewer.institutionId,
          }).orWhere('user.requestedInstitutionId = :institutionId', {
            institutionId: reviewer.institutionId,
          });
        }),
      );
    }

    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(user.username) LIKE :term', { term })
            .orWhere('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.personalEmail) LIKE :term', { term })
            .orWhere('LOWER(user.firstName) LIKE :term', { term })
            .orWhere('LOWER(user.lastName) LIKE :term', { term });
        }),
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  countPendingValidation(reviewer: User): Promise<number> {
    const where: FindOptionsWhere<User>[] = [];

    if (reviewer.role === UserRole.SUPER_USER) {
      where.push({ validationStatus: ValidationStatus.PENDING });
    } else if (
      reviewer.role === UserRole.PROGRAM_ADMINISTRATOR &&
      reviewer.institutionId &&
      reviewer.isValidated
    ) {
      where.push(
        {
          validationStatus: ValidationStatus.PENDING,
          role: Not(UserRole.SUPER_USER),
          institutionId: reviewer.institutionId,
        },
        {
          validationStatus: ValidationStatus.PENDING,
          role: Not(UserRole.SUPER_USER),
          requestedInstitutionId: reviewer.institutionId,
        },
      );
    }

    if (where.length === 0) return Promise.resolve(0);
    return this.users.count({ where });
  }

  // --- Writes -----------------------------------------------------------------

  async create(data: Partial<User>): Promise<User> {
    const user = this.users.create(data);
    const saved = await this.users.save(user);
    return this.findByIdOrFail(saved.id);
  }

  async save(user: User): Promise<User> {
    return this.users.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.findByIdOrFail(id);
    const patch: Partial<User> = {};
    if (dto.firstName !== undefined) patch.firstName = dto.firstName;
    if (dto.lastName !== undefined) patch.lastName = dto.lastName;
    if (Object.keys(patch).length > 0) await this.users.update({ id }, patch);
    return this.findByIdOrFail(id);
  }

  // --- Personal address -------------------------------------------

  /**
   * The single gate every personal address has to pass, wherever it comes from —
   * self-signup, the profile screen, or an admin creating or editing an account.
   *
   * It lives here rather than in AuthService because there are four entry points and
   * only one rule. Keeping the check next to the write means a new caller cannot
   * forget it, which is exactly how the admin paths ended up bypassing it.
   *
   * The domain rule is the substantive one: if the address resolves to an
   * institution, refuse. The two addresses mean different things — the main one
   * decides membership, this one is the fallback for when that mailbox is gone. A
   * second institutional address is not a fallback; it disappears at the same time,
   * for the same reason.
   *
   * Returns the normalized address so the caller stores exactly what was checked.
   */
  async assertPersonalEmailAllowed(
    personalEmail: string,
    /** Null while the profile is still being completed and there is no main one yet. */
    primaryEmail: string | null,
    exceptUserId?: string,
  ): Promise<string> {
    const normalized = normalizeEmail(personalEmail);

    if (primaryEmail !== null && normalized === normalizeEmail(primaryEmail)) {
      throw new BadRequestException(
        'The personal address has to be different from the main one',
      );
    }

    const institution = await this.institutions.findByEmailDomain(
      emailDomainOf(normalized),
    );

    if (institution) {
      throw new BadRequestException(
        `${institution.name} owns that domain, so it is not a personal address. ` +
          'Use a private mailbox that stays reachable after leaving.',
      );
    }

    if (await this.emailInUse(normalized, exceptUserId)) {
      throw new ConflictException('That email address is already in use');
    }

    return normalized;
  }

  /**
   * Fills in everything registration deliberately skipped: rank, institutional
   * address, recovery address, and the membership decision that follows from them.
   *
   * The account moves to PENDING_EMAIL_VERIFICATION here rather than at signup,
   * because this is the first moment there is an address to verify.
   */
  async completeProfile(
    id: string,
    patch: {
      role: UserRole;
      /** Null for a rank that does not need an institution — an attending physician. */
      email: string | null;
      personalEmail: string;
      institutionId: string | null;
      requestedInstitutionId: string | null;
      autoValidated: boolean;
      trainingLevelId: string | null;
      specialtyId: string | null;
      residencyProgramId: string | null;
      fellowshipProgramId: string | null;
    },
  ): Promise<User> {
    await this.users.update(
      { id },
      {
        role: patch.role,
        email: patch.email,
        emailDomain: patch.email ? emailDomainOf(patch.email) : null,
        personalEmail: patch.personalEmail,
        // Unverified on purpose: confirming the personal address is a separate act,
        // and blocking on it here would stop somebody finishing signup.
        personalEmailVerifiedAt: null,
        // PENDING_EMAIL_VERIFICATION blocks sign-in until the *institutional*
        // address is confirmed. A rank that is never asked for one — an attending
        // physician — would sit there forever waiting on a mailbox they were never
        // asked to give, so they go straight to ACTIVE. Their personal address still
        // gets a confirmation link; it just does not hold the door shut, exactly as
        // it does not for everybody else.
        status: patch.email
          ? UserStatus.PENDING_EMAIL_VERIFICATION
          : UserStatus.ACTIVE,
        institutionId: patch.institutionId,
        requestedInstitutionId: patch.requestedInstitutionId,
        validationStatus: patch.autoValidated
          ? ValidationStatus.VALIDATED
          : ValidationStatus.PENDING,
        validationMethod: patch.autoValidated ? ValidationMethod.EMAIL_DOMAIN : null,
        validatedAt: patch.autoValidated ? new Date() : null,
        trainingLevelId: patch.trainingLevelId,
        specialtyId: patch.specialtyId,
        residencyProgramId: patch.residencyProgramId,
        fellowshipProgramId: patch.fellowshipProgramId,
      },
    );

    // The affiliation is the record; `users.institutionId` above is the shortcut to
    // the current one. Written here rather than by the caller so that no future
    // path can set one without the other.
    if (patch.institutionId) {
      await this.openAffiliation(id, patch.institutionId, patch.email);
    }

    return this.findByIdOrFail(id);
  }

  /**
   * Move somebody to a new institutional address, closing the affiliation they had.
   *
   * The old row stays with an `endedAt` — it is what keeps their access to that
   * institution's material. The new address is unverified again, because it is a
   * different mailbox and nobody has proved they can read it.
   */
  async moveInstitution(
    id: string,
    patch: {
      email: string;
      institutionId: string | null;
      requestedInstitutionId: string | null;
      autoValidated: boolean;
    },
  ): Promise<User> {
    const email = normalizeEmail(patch.email);

    await this.users.update(
      { id },
      {
        email,
        emailDomain: emailDomainOf(email),
        emailVerifiedAt: null,
        status: UserStatus.PENDING_EMAIL_VERIFICATION,
        institutionId: patch.institutionId,
        requestedInstitutionId: patch.requestedInstitutionId,
        validationStatus: patch.autoValidated
          ? ValidationStatus.VALIDATED
          : ValidationStatus.PENDING,
        validationMethod: patch.autoValidated ? ValidationMethod.EMAIL_DOMAIN : null,
        validatedAt: patch.autoValidated ? new Date() : null,
        validationNote: null,
      },
    );

    await this.endOtherAffiliations(id, patch.institutionId);
    if (patch.institutionId) {
      await this.openAffiliation(id, patch.institutionId, email);
    }

    return this.findByIdOrFail(id);
  }

  // --- Affiliations -------------------------------------------------------------

  /**
   * Start an affiliation, or reopen one that had ended.
   *
   * Reopening rather than inserting a second row: somebody who returns to an
   * institution they trained at has one relationship with it, not two, and the
   * unique index on (userId, institutionId) says so.
   */
  async openAffiliation(
    userId: string,
    institutionId: string,
    institutionalEmail: string | null,
  ): Promise<UserAffiliation> {
    const existing = await this.affiliations.findOne({
      where: { userId, institutionId },
    });

    if (existing) {
      existing.endedAt = null;
      existing.institutionalEmail = institutionalEmail;
      existing.emailDomain = institutionalEmail
        ? emailDomainOf(institutionalEmail)
        : null;
      return this.affiliations.save(existing);
    }

    return this.affiliations.save(
      this.affiliations.create({
        userId,
        institutionId,
        institutionalEmail,
        emailDomain: institutionalEmail ? emailDomainOf(institutionalEmail) : null,
        startedAt: new Date(),
      }),
    );
  }

  /** Close every current affiliation except the one named. Keeps the rows. */
  async endOtherAffiliations(userId: string, keepInstitutionId: string | null) {
    const open = await this.affiliations.find({
      where: { userId, endedAt: IsNull() },
    });

    const now = new Date();
    for (const affiliation of open) {
      if (affiliation.institutionId === keepInstitutionId) continue;
      affiliation.endedAt = now;
      await this.affiliations.save(affiliation);
    }
  }

  /** Every institution somebody has belonged to, current first, then most recent. */
  async findAffiliations(userId: string): Promise<UserAffiliation[]> {
    return this.affiliations.find({
      where: { userId },
      relations: { institution: true },
      order: { endedAt: 'ASC', startedAt: 'DESC' },
    });
  }

  /**
   * Set or replace the personal address.
   *
   * Always resets the verified timestamp, including when the address is unchanged in
   * spelling but re-submitted — the cheap alternative (skip if equal) means a typo
   * corrected back to the original silently keeps a stale confirmation.
   */
  async setPersonalEmail(id: string, email: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    const normalized = await this.assertPersonalEmailAllowed(
      email,
      user.email,
      id,
    );

    await this.users.update(
      { id },
      { personalEmail: normalized, personalEmailVerifiedAt: null },
    );
    return this.findByIdOrFail(id);
  }

  async clearPersonalEmail(id: string): Promise<User> {
    await this.findByIdOrFail(id);
    await this.users.update(
      { id },
      { personalEmail: null, personalEmailVerifiedAt: null },
    );
    return this.findByIdOrFail(id);
  }

  async markPersonalEmailVerified(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    if (!user.personalEmail) {
      throw new BadRequestException('There is no personal address to confirm');
    }
    if (user.personalEmailVerifiedAt) return user;

    await this.users.update({ id }, { personalEmailVerifiedAt: new Date() });
    return this.findByIdOrFail(id);
  }

  async markEmailVerified(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    if (user.emailVerifiedAt) return user;

    await this.users.update(
      { id },
      {
        emailVerifiedAt: new Date(),
        ...(user.status === UserStatus.PENDING_EMAIL_VERIFICATION
          ? { status: UserStatus.ACTIVE }
          : {}),
      },
    );
    return this.findByIdOrFail(id);
  }

  /**
   * Approve a pending membership request.
   *
   * A program administrator approves people into their own institution and nowhere
   * else — passing someone else's institutionId is rejected rather than silently
   * ignored, so a mistake surfaces instead of quietly doing the wrong thing.
   */
  async validate(
    targetId: string,
    reviewer: User,
    dto: ValidateUserDto,
  ): Promise<User> {
    const target = await this.findByIdOrFail(targetId);
    this.assertCanReview(target, reviewer);

    if (target.validationStatus === ValidationStatus.VALIDATED) {
      throw new BadRequestException('This user is already validated');
    }

    // Validation is a decision about belonging to an institution, and a super user
    // does not belong to one. There is nothing here to approve.
    if (target.role === UserRole.SUPER_USER) {
      throw new BadRequestException(
        'A super user administers the whole platform and does not belong to an institution',
      );
    }

    let institutionId: string | null;
    if (reviewer.role === UserRole.PROGRAM_ADMINISTRATOR) {
      if (dto.institutionId && dto.institutionId !== reviewer.institutionId) {
        throw new ForbiddenException(
          'A program administrator can only validate people into their own institution',
        );
      }
      institutionId = reviewer.institutionId;
    } else {
      institutionId =
        dto.institutionId ??
        target.institutionId ??
        target.requestedInstitutionId ??
        null;
    }

    if (!institutionId) {
      throw new BadRequestException(
        'No institution to attach this user to — pass institutionId explicitly',
      );
    }

    // Written as a column update rather than through the loaded entity: `save()`
    // resolves a loaded relation object ahead of its raw foreign key, so mixing the
    // two silently discards one of the changes.
    await this.users.update(
      { id: targetId },
      {
        institutionId,
        requestedInstitutionId: null,
        validationStatus: ValidationStatus.VALIDATED,
        validationMethod: ValidationMethod.MANUAL,
        validatedAt: new Date(),
        validatedById: reviewer.id,
        validationNote: dto.note ?? null,
      },
    );

    // Being approved into an institution *is* an affiliation, even when the person
    // holds no address there — that is the whole point of the review queue. Without
    // this the record and the shortcut column disagree the moment anybody is let in
    // by hand rather than by their domain.
    await this.openAffiliation(targetId, institutionId, target.email);

    return this.findByIdOrFail(targetId);
  }

  async reject(
    targetId: string,
    reviewer: User,
    dto: RejectUserDto,
  ): Promise<User> {
    const target = await this.findByIdOrFail(targetId);
    this.assertCanReview(target, reviewer);

    // requestedInstitutionId is left alone so the decision stays auditable.
    await this.users.update(
      { id: targetId },
      {
        validationStatus: ValidationStatus.REJECTED,
        validationMethod: ValidationMethod.MANUAL,
        validatedAt: new Date(),
        validatedById: reviewer.id,
        validationNote: dto.reason ?? null,
      },
    );

    return this.findByIdOrFail(targetId);
  }

  /**
   * Change somebody's rank.
   *
   * Becoming a super user detaches the account from its institution. Platform staff
   * administer everything, so belonging to one institution says nothing true about
   * them — and left in place it would quietly scope screens that read that column.
   *
   * The affiliation is *ended*, not deleted: they really were there, the dates are
   * part of the record, and a past affiliation still grants access to that
   * institution's material. Only the shortcut column is cleared.
   */
  async setRole(
    id: string,
    role: UserRole,
    actingAdminId: string,
  ): Promise<User> {
    if (isSameUser(id, actingAdminId)) {
      throw new BadRequestException('You cannot change your own role');
    }
    await this.findByIdOrFail(id);

    if (role === UserRole.SUPER_USER) {
      await this.users.update(
        { id },
        { role, institutionId: null, requestedInstitutionId: null },
      );
      await this.endOtherAffiliations(id, null);
    } else {
      await this.users.update({ id }, { role });
    }

    return this.findByIdOrFail(id);
  }

  async setStatus(
    id: string,
    status: UserStatus,
    actingAdminId: string,
  ): Promise<User> {
    if (isSameUser(id, actingAdminId)) {
      throw new BadRequestException('You cannot change your own status');
    }
    await this.findByIdOrFail(id);
    await this.users.update({ id }, { status });
    return this.findByIdOrFail(id);
  }

  /**
   * Make an account usable, on an administrator's say-so.
   *
   * This is the manual stand-in for the confirmation email, and it does both halves
   * of what clicking that link would have done: flips the status to ACTIVE *and*
   * records the address as confirmed. Setting the status alone was the tempting
   * shortcut and the wrong one — login only checks the status, so the account would
   * work while `emailVerifiedAt` stayed null, and the person would be nagged to
   * confirm an address forever with no way to do it.
   *
   * The admin is asserting the address is good. That is a weaker claim than the
   * person clicking a link from that mailbox, which is why it is an explicit,
   * attributable action rather than something that happens quietly.
   *
   * Any link still in flight is deleted: the account is already confirmed, so
   * redeeming one would be a no-op that hands back a session.
   */
  async activate(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);

    if (user.status === UserStatus.ACTIVE && user.emailVerifiedAt) {
      throw new BadRequestException('That account is already active');
    }

    await this.users.update(
      { id },
      {
        status: UserStatus.ACTIVE,
        // Left alone when already set, so a suspended-but-confirmed account keeps
        // the date it was really confirmed on.
        ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      },
    );

    await this.verificationTokens.delete({
      userId: id,
      purpose: VerificationPurpose.INSTITUTIONAL_EMAIL,
      consumedAt: IsNull(),
    });

    return this.findByIdOrFail(id);
  }

  async assignInstitution(
    id: string,
    institutionId: string | null,
  ): Promise<User> {
    const user = await this.findByIdOrFail(id);

    // Refused rather than ignored. Platform staff administer every institution, so
    // picking one out and attaching them to it is either a mistake or a sign that
    // the account should not have been a super user — and both are worth saying.
    if (user.role === UserRole.SUPER_USER && institutionId !== null) {
      throw new BadRequestException(
        'A super user administers the whole platform and does not belong to an institution',
      );
    }

    await this.users.update({ id }, { institutionId });
    return this.findByIdOrFail(id);
  }

  // --- Administrator management -----------------------------------------------

  /**
   * Create an administrator directly. There is no self-serve route to this role.
   *
   * The account is created fully formed — active, address treated as confirmed,
   * membership validated as a manual decision attributed to the creating admin —
   * because every one of those steps has already happened out of band: a person
   * decided to grant this. Making the new admin verify an address that the existing
   * admin just typed proves nothing.
   *
   * The exception is the password. It arrives via whatever channel the two of them
   * used, so `mustChangePassword` forces a replacement at first sign-in.
   */
  async createAdmin(
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
      personalEmail?: string;
    },
    creatorId: string,
  ): Promise<User> {
    const email = normalizeEmail(data.email);

    if (await this.emailInUse(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    // Same gate as every other path, so an admin cannot install an institutional
    // address as somebody's "personal" one.
    const personalEmail = data.personalEmail
      ? await this.assertPersonalEmailAllowed(data.personalEmail, email)
      : null;

    const now = new Date();
    return this.create({
      email,
      emailDomain: emailDomainOf(email),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      personalEmail,
      personalEmailVerifiedAt: null,
      role: UserRole.SUPER_USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: now,
      mustChangePassword: true,
      institutionId: null,
      requestedInstitutionId: null,
      validationStatus: ValidationStatus.VALIDATED,
      validationMethod: ValidationMethod.MANUAL,
      validatedAt: now,
      validatedById: creatorId,
    });
  }

  /**
   * Admin-side edit of an account.
   *
   * Changing the main address rewrites the cached `emailDomain` and sends the account
   * back to PENDING_EMAIL_VERIFICATION. Clearing `emailVerifiedAt` on its own would
   * have been cosmetic: login only refuses PENDING_EMAIL_VERIFICATION, so the person
   * would have gone on signing in against an address nobody has proven. They can
   * request a fresh link themselves from the sign-in screen.
   *
   * Membership is deliberately left where it is rather than re-derived from the new
   * domain: an admin moving an address is making a considered choice, and quietly
   * detaching someone from their institution because the new domain is unknown would
   * undo it without saying so.
   *
   * Any unclicked link for the old address is destroyed in the same call. Redeeming
   * one marks the *new* address verified and returns a session, so someone who
   * registered an address they controlled and never confirmed it could otherwise
   * spend that stale link after an admin moved the account.
   */
  async adminUpdate(
    id: string,
    patch: {
      firstName?: string;
      lastName?: string;
      email?: string;
      personalEmail?: string | null;
    },
    actingAdminId: string,
  ): Promise<User> {
    const user = await this.findByIdOrFail(id);
    const isSelf = isSameUser(id, actingAdminId);
    const update: Partial<User> = {};
    let primaryEmailChanged = false;

    if (patch.firstName !== undefined) update.firstName = patch.firstName;
    if (patch.lastName !== undefined) update.lastName = patch.lastName;

    if (patch.email !== undefined) {
      const email = normalizeEmail(patch.email);
      if (email !== user.email) {
        if (await this.emailInUse(email, id)) {
          throw new ConflictException('That email address is already in use');
        }

        // Guards the case where only `email` is being patched: without this, an admin
        // could set the main address to the row's own personal address and leave both
        // columns identical, which makes the sign-in lookup ambiguous.
        if (
          patch.personalEmail === undefined &&
          user.personalEmail === email
        ) {
          throw new BadRequestException(
            'That is already this account’s personal address — remove it first, or change both together',
          );
        }

        update.email = email;
        update.emailDomain = emailDomainOf(email);
        primaryEmailChanged = true;

        // Only force re-verification on other people's accounts. An admin correcting
        // their own address would otherwise lock themselves out of the app.
        if (!isSelf) {
          update.emailVerifiedAt = null;
          update.status = UserStatus.PENDING_EMAIL_VERIFICATION;
        }
      }
    }

    if (patch.personalEmail !== undefined) {
      if (patch.personalEmail === null) {
        update.personalEmail = null;
        update.personalEmailVerifiedAt = null;
      } else if (normalizeEmail(patch.personalEmail) !== user.personalEmail) {
        update.personalEmail = await this.assertPersonalEmailAllowed(
          patch.personalEmail,
          update.email ?? user.email,
          id,
        );
        update.personalEmailVerifiedAt = null;
      }
    }

    if (Object.keys(update).length > 0) await this.users.update({ id }, update);

    if (primaryEmailChanged) {
      await this.verificationTokens.delete({
        userId: id,
        purpose: VerificationPurpose.INSTITUTIONAL_EMAIL,
        consumedAt: IsNull(),
      });
    }

    return this.findByIdOrFail(id);
  }

  /** Replace someone's password with a temporary one they must then change. */
  async setTemporaryPassword(
    id: string,
    passwordHash: string,
    actingAdminId: string,
  ): Promise<User> {
    if (isSameUser(id, actingAdminId)) {
      throw new BadRequestException(
        'To change your own password use the change-password screen',
      );
    }
    await this.findByIdOrFail(id);
    await this.users.update({ id }, { passwordHash, mustChangePassword: true });
    return this.findByIdOrFail(id);
  }

  /** Applies a password the user chose themselves. Clears the forced-change flag. */
  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.users.update(
      { id },
      { passwordHash, mustChangePassword: false },
    );
  }

  /**
   * Delete an account outright.
   *
   * The one refusal is deleting yourself — an accident there is unrecoverable from
   * inside the app, and there is no undo. Deleting other admins is allowed, including
   * the last one besides you, because you are still here to grant the role again.
   *
   * Rows that point at this user (`validatedById`) are ON DELETE SET NULL, so the
   * people they approved keep their validation and just lose the attribution.
   */
  async remove(id: string, actingAdminId: string): Promise<void> {
    if (isSameUser(id, actingAdminId)) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.findByIdOrFail(id);
    await this.users.delete({ id });
  }

  /** Number of admins that exist — used to refuse demoting the last one. */
  countAdmins(): Promise<number> {
    return this.users.count({ where: { role: UserRole.SUPER_USER } });
  }

  countUnaffiliated(): Promise<number> {
    return this.users.count({ where: { institutionId: IsNull() } });
  }

  // --- Guards -----------------------------------------------------------------

  private assertCanReview(target: User, reviewer: User): void {
    if (reviewer.role === UserRole.SUPER_USER) return;

    if (reviewer.role !== UserRole.PROGRAM_ADMINISTRATOR) {
      throw new ForbiddenException('You are not allowed to validate users');
    }
    // Their own membership has to be settled first. Signing up as a residency
    // administrator on a recognised domain attaches the institution immediately,
    // while the rank itself still needs an administrator's approval — so without
    // this check anyone who claims the role can start approving people at that
    // institution before anybody has confirmed they belong there at all.
    if (!reviewer.isValidated) {
      throw new ForbiddenException(
        'Your own account has to be approved before you can validate anyone',
      );
    }
    // Platform staff are only ever approved by other platform staff. Everyone else
    // at the institution — trainees, attending physicians, and further program
    // administrators — is the local administrator's to approve.
    //
    // The role is not self-propagating even so, and this is where that holds: the
    // check above requires the reviewer to be a validated program administrator at
    // the institution, so the *first* administrator anywhere has nobody who could
    // approve them and has to come from a super user. Every one after that is local.
    if (target.role === UserRole.SUPER_USER) {
      throw new ForbiddenException(
        'Platform staff are approved by another super user',
      );
    }
    if (!reviewer.institutionId) {
      throw new ForbiddenException(
        'You must belong to an institution before validating anyone',
      );
    }

    const inScope =
      target.institutionId === reviewer.institutionId ||
      target.requestedInstitutionId === reviewer.institutionId;

    if (!inScope) {
      throw new ForbiddenException(
        'This student does not belong to your institution',
      );
    }
  }
}
