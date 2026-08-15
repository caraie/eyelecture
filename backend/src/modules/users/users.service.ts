import {
  BadRequestException,
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
import {
  PaginatedResult,
  paginate,
} from '../../common/dto/pagination.dto';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const emailDomainOf = (email: string): string => {
  const at = normalizeEmail(email).lastIndexOf('@');
  return at === -1 ? '' : normalizeEmail(email).slice(at + 1);
};

const RELATIONS = {
  institution: true,
  requestedInstitution: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
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

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: normalizeEmail(email) },
      relations: RELATIONS,
    });
  }

  /** Same as findByEmail but includes the password hash, which is `select: false`. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.institution', 'institution')
      .leftJoinAndSelect('user.requestedInstitution', 'requestedInstitution')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  emailExists(email: string): Promise<boolean> {
    return this.users.exists({ where: { email: normalizeEmail(email) } });
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
    if (query.status) qb.andWhere('user.status = :status', { status: query.status });
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
      qb.andWhere('user.role = :studentRole', { studentRole: UserRole.STUDENT });
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
    } else if (reviewer.role === UserRole.PROGRAM_DIRECTOR && reviewer.institutionId) {
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

  async setRole(id: string, role: UserRole, actingAdminId: string): Promise<User> {
    if (id === actingAdminId) {
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
    if (id === actingAdminId) {
      throw new BadRequestException('You cannot change your own status');
    }
    await this.findByIdOrFail(id);
    await this.users.update({ id }, { status });
    return this.findByIdOrFail(id);
  }

  async assignInstitution(id: string, institutionId: string | null): Promise<User> {
    await this.findByIdOrFail(id);
    await this.users.update({ id }, { institutionId });
    return this.findByIdOrFail(id);
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
      throw new ForbiddenException('A program director can only validate students');
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
      throw new ForbiddenException('This student does not belong to your institution');
    }
  }
}
