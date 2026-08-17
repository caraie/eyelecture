import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { User } from './entities/user.entity';
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

  /** Primary address only. Used where the institutional address is what matters. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: normalizeEmail(email) },
      relations: RELATIONS,
    });
  }

  /**
   * Sign-in lookup: either address finds the account.
   *
   * Includes the password hash, which is `select: false` on the entity.
   */
  findByAnyEmailWithPassword(email: string): Promise<User | null> {
    return (
      this.users
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .leftJoinAndSelect('user.institution', 'institution')
        .leftJoinAndSelect('user.requestedInstitution', 'requestedInstitution')
        .where('user.email = :email OR user.secondaryEmail = :email', {
          email: normalizeEmail(email),
        })
        // Cross-column uniqueness is enforced in application code (see emailInUse), and
        // that check is not atomic — two concurrent writes can leave one person's
        // personal address equal to another's institutional one. `getOne()` would then
        // return whichever row the planner happened to produce first, and the owner of
        // the institutional address could find themselves compared against a stranger's
        // password hash. Ordering primary matches first makes the tie-break explicit and
        // always resolves in favour of the address that decides membership.
        .orderBy('CASE WHEN user.email = :email THEN 0 ELSE 1 END', 'ASC')
        .getOne()
    );
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
      .where('(user.email = :email OR user.secondaryEmail = :email)', {
        email: normalized,
      });

    if (exceptUserId) {
      qb.andWhere('user.id != :exceptUserId', { exceptUserId });
    }

    return (await qb.getCount()) > 0;
  }

  async findAll(query: QueryUsersDto): Promise<PaginatedResult<User>> {
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
          w.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.secondaryEmail) LIKE :term', { term })
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
   * A program director sees people who either already resolved to their institution
   * or explicitly asked to join it. An admin sees everything still pending,
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

    if (reviewer.role === UserRole.PROGRAM_DIRECTOR) {
      if (!reviewer.institutionId) {
        // A director with no institution has nobody to vouch for.
        return paginate([], 0, query);
      }
      qb.andWhere('user.role = :studentRole', {
        studentRole: UserRole.STUDENT,
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
          w.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.secondaryEmail) LIKE :term', { term })
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

    if (reviewer.role === UserRole.ADMIN) {
      where.push({ validationStatus: ValidationStatus.PENDING });
    } else if (
      reviewer.role === UserRole.PROGRAM_DIRECTOR &&
      reviewer.institutionId
    ) {
      where.push(
        {
          validationStatus: ValidationStatus.PENDING,
          role: UserRole.STUDENT,
          institutionId: reviewer.institutionId,
        },
        {
          validationStatus: ValidationStatus.PENDING,
          role: UserRole.STUDENT,
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

  // --- Secondary (personal) address -------------------------------------------

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
  async assertSecondaryEmailAllowed(
    secondaryEmail: string,
    primaryEmail: string,
    exceptUserId?: string,
  ): Promise<string> {
    const normalized = normalizeEmail(secondaryEmail);

    if (normalized === normalizeEmail(primaryEmail)) {
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
   * Set or replace the personal address.
   *
   * Always resets the verified timestamp, including when the address is unchanged in
   * spelling but re-submitted — the cheap alternative (skip if equal) means a typo
   * corrected back to the original silently keeps a stale confirmation.
   */
  async setSecondaryEmail(id: string, email: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    const normalized = await this.assertSecondaryEmailAllowed(
      email,
      user.email,
      id,
    );

    await this.users.update(
      { id },
      { secondaryEmail: normalized, secondaryEmailVerifiedAt: null },
    );
    return this.findByIdOrFail(id);
  }

  async clearSecondaryEmail(id: string): Promise<User> {
    await this.findByIdOrFail(id);
    await this.users.update(
      { id },
      { secondaryEmail: null, secondaryEmailVerifiedAt: null },
    );
    return this.findByIdOrFail(id);
  }

  async markSecondaryEmailVerified(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    if (!user.secondaryEmail) {
      throw new BadRequestException('There is no personal address to confirm');
    }
    if (user.secondaryEmailVerifiedAt) return user;

    await this.users.update({ id }, { secondaryEmailVerifiedAt: new Date() });
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
   * A program director can only approve students, and only into their own
   * institution — passing someone else's institutionId is rejected rather than
   * silently ignored, so a mistake surfaces instead of quietly doing the wrong thing.
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

    let institutionId: string | null;
    if (reviewer.role === UserRole.PROGRAM_DIRECTOR) {
      if (dto.institutionId && dto.institutionId !== reviewer.institutionId) {
        throw new ForbiddenException(
          'A program director can only validate people into their own institution',
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

  async setRole(
    id: string,
    role: UserRole,
    actingAdminId: string,
  ): Promise<User> {
    if (isSameUser(id, actingAdminId)) {
      throw new BadRequestException('You cannot change your own role');
    }
    await this.findByIdOrFail(id);
    await this.users.update({ id }, { role });
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

  async assignInstitution(
    id: string,
    institutionId: string | null,
  ): Promise<User> {
    await this.findByIdOrFail(id);
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
      secondaryEmail?: string;
    },
    creatorId: string,
  ): Promise<User> {
    const email = normalizeEmail(data.email);

    if (await this.emailInUse(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    // Same gate as every other path, so an admin cannot install an institutional
    // address as somebody's "personal" one.
    const secondaryEmail = data.secondaryEmail
      ? await this.assertSecondaryEmailAllowed(data.secondaryEmail, email)
      : null;

    const now = new Date();
    return this.create({
      email,
      emailDomain: emailDomainOf(email),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      secondaryEmail,
      secondaryEmailVerifiedAt: null,
      role: UserRole.ADMIN,
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
      secondaryEmail?: string | null;
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
          patch.secondaryEmail === undefined &&
          user.secondaryEmail === email
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

    if (patch.secondaryEmail !== undefined) {
      if (patch.secondaryEmail === null) {
        update.secondaryEmail = null;
        update.secondaryEmailVerifiedAt = null;
      } else if (normalizeEmail(patch.secondaryEmail) !== user.secondaryEmail) {
        update.secondaryEmail = await this.assertSecondaryEmailAllowed(
          patch.secondaryEmail,
          update.email ?? user.email,
          id,
        );
        update.secondaryEmailVerifiedAt = null;
      }
    }

    if (Object.keys(update).length > 0) await this.users.update({ id }, update);

    if (primaryEmailChanged) {
      await this.verificationTokens.delete({
        userId: id,
        purpose: VerificationPurpose.PRIMARY_EMAIL,
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
    return this.users.count({ where: { role: UserRole.ADMIN } });
  }

  countUnaffiliated(): Promise<number> {
    return this.users.count({ where: { institutionId: IsNull() } });
  }

  // --- Guards -----------------------------------------------------------------

  private assertCanReview(target: User, reviewer: User): void {
    if (reviewer.role === UserRole.ADMIN) return;

    if (reviewer.role !== UserRole.PROGRAM_DIRECTOR) {
      throw new ForbiddenException('You are not allowed to validate users');
    }
    if (target.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        'A program director can only validate students',
      );
    }
    if (!reviewer.institutionId) {
      throw new ForbiddenException(
        'You must belong to an institution before validating students',
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
