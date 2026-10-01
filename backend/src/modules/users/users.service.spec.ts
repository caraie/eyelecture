import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { UsersService, emailDomainOf, normalizeEmail } from './users.service';
import { User } from './entities/user.entity';
import { UserAffiliation } from './entities/user-affiliation.entity';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity';
import { InstitutionsService } from '../institutions/institutions.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { TRAINEE_ROLES, UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { ValidationMethod, ValidationStatus } from './enums/validation-status.enum';

const STANFORD = 'inst-stanford';
const HARVARD = 'inst-harvard';

/**
 * Every builder method returns the builder, which is what the service chains on.
 * Only the terminal call has to produce anything.
 */
const fakeQueryBuilder = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
    'addSelect',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getOne = jest.fn().mockResolvedValue(null);
  return qb;
};

/**
 * `isValidated` is a getter on the entity, so a plain object has to derive it or
 * every check that reads it silently sees undefined — which is how a fixture ends up
 * failing a rule it was meant to satisfy.
 */
const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'someone',
    email: 'someone@example.edu',
    emailDomain: 'example.edu',
    firstName: 'Some',
    lastName: 'One',
    role: UserRole.MEDICAL_STUDENT,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    institutionId: null,
    institution: null,
    validationStatus: ValidationStatus.PENDING,
    validationMethod: null,
    validatedAt: null,
    validatedById: null,
    validationNote: null,
    requestedInstitutionId: null,
    requestedInstitution: null,
    personalEmail: null,
    personalEmailVerifiedAt: null,
    ...overrides,
    isValidated:
      (overrides.validationStatus ?? ValidationStatus.PENDING) ===
      ValidationStatus.VALIDATED,
    hasCompleteProfile:
      (overrides.status ?? UserStatus.ACTIVE) !== UserStatus.PENDING_PROFILE,
    needsPersonalEmail:
      (overrides.status ?? UserStatus.ACTIVE) !== UserStatus.PENDING_PROFILE &&
      (overrides.personalEmail ?? null) === null,
  }) as User;

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    exists: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  /** The next user findByIdOrFail should return. */
  let target: User;
  let tokenRepo: { delete: jest.Mock };
  let affiliationRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let institutions: { findByEmailDomain: jest.Mock };

  beforeEach(async () => {
    target = makeUser();

    tokenRepo = { delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    institutions = { findByEmailDomain: jest.fn().mockResolvedValue(null) };
    affiliationRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };

    repo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(target)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((data: Partial<User>) => data as User),
      save: jest.fn((data: User) => Promise.resolve(data)),
      createQueryBuilder: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        // Not used by anything under test here, but the service asks for them:
        // it invalidates pending verification links when an address changes, and
        // resolves institutions when checking a recovery address.
        { provide: getRepositoryToken(EmailVerificationToken), useValue: tokenRepo },
        { provide: getRepositoryToken(UserAffiliation), useValue: affiliationRepo },
        { provide: InstitutionsService, useValue: institutions },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('email helpers', () => {
    it('lowercases and trims addresses', () => {
      expect(normalizeEmail('  Ana.Perez@Stanford.EDU ')).toBe('ana.perez@stanford.edu');
    });

    it('extracts the domain', () => {
      expect(emailDomainOf('Ana@Med.Stanford.edu')).toBe('med.stanford.edu');
    });

    it('takes the last @ so plus-addressing cannot forge a domain', () => {
      expect(emailDomainOf('weird@notreal.com@gmail.com')).toBe('gmail.com');
    });

    it('returns empty for a malformed address', () => {
      expect(emailDomainOf('no-at-sign')).toBe('');
    });
  });

  describe('completeProfile', () => {
    const base = {
      personalEmail: 'someone@gmail.com',
      institutionId: null,
      requestedInstitutionId: null,
      autoValidated: false,
      trainingLevelId: null,
      specialtyId: null,
      residencyProgramId: null,
      fellowshipProgramId: null,
    };

    it('parks somebody with an institutional address on email verification', async () => {
      await service.completeProfile('u-1', {
        ...base,
        role: UserRole.MEDICAL_STUDENT,
        email: 'student@stanford.edu',
      });

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch.status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
    });

    it('activates a rank that is never asked for one', async () => {
      // An attending physician gives no institutional address, so waiting on one
      // would leave them unable to sign in for a mailbox nobody asked them for.
      await service.completeProfile('u-2', {
        ...base,
        role: UserRole.ATTENDING_PHYSICIAN,
        email: null,
      });

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch.status).toBe(UserStatus.ACTIVE);
      expect(patch.emailDomain).toBeNull();
    });
  });

  describe('findByIdFor', () => {
    const director = makeUser({
      id: 'dir-1',
      role: UserRole.PROGRAM_ADMINISTRATOR,
      institutionId: STANFORD,
      validationStatus: ValidationStatus.VALIDATED,
    });

    it('lets a super user open anybody', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.SUPER_USER });
      target = makeUser({ id: 'stu-1', institutionId: HARVARD });

      await expect(service.findByIdFor('stu-1', admin)).resolves.toBe(target);
    });

    it('lets a program administrator open somebody at their institution', async () => {
      target = makeUser({ id: 'stu-1', institutionId: STANFORD });

      await expect(service.findByIdFor('stu-1', director)).resolves.toBe(target);
    });

    it('lets them open somebody who asked to join it', async () => {
      target = makeUser({ id: 'stu-2', requestedInstitutionId: STANFORD });

      await expect(service.findByIdFor('stu-2', director)).resolves.toBe(target);
    });

    it('says not found — not forbidden — for somebody elsewhere', async () => {
      // A 403 would confirm the id belongs to a real account, which is the fact
      // being withheld.
      target = makeUser({ id: 'stu-3', institutionId: HARVARD });

      await expect(service.findByIdFor('stu-3', director)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('always lets them open themselves', async () => {
      const homeless = makeUser({
        id: 'dir-9',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: null,
      });
      target = homeless;

      await expect(service.findByIdFor('dir-9', homeless)).resolves.toBe(target);
    });
  });

  describe('findAll scoping', () => {
    const query = () =>
      ({ page: 1, limit: 20, skip: 0 }) as unknown as QueryUsersDto;

    it('pins a program administrator to their own institution', async () => {
      const director = makeUser({
        id: 'dir-1',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
        validationStatus: ValidationStatus.VALIDATED,
      });
      const qb = fakeQueryBuilder();
      repo.createQueryBuilder.mockReturnValue(qb);

      // An institutionId the caller passed is overwritten, not narrowed: the
      // parameter is a filter for a super user, not a way to look elsewhere.
      const q = Object.assign(query(), { institutionId: HARVARD });
      await service.findAll(q, director);

      expect(q.institutionId).toBe(STANFORD);
    });

    it('gives an unaffiliated program administrator an empty page', async () => {
      const homeless = makeUser({
        id: 'dir-2',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: null,
      });

      const page = await service.findAll(query(), homeless);

      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('leaves a super user unscoped', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.SUPER_USER });
      const qb = fakeQueryBuilder();
      repo.createQueryBuilder.mockReturnValue(qb);

      const q = query();
      await service.findAll(q, admin);

      expect(q.institutionId).toBeUndefined();
    });
  });

  describe('validate — program administrator scoping', () => {
    const director = makeUser({
      id: 'dir-1',
      role: UserRole.PROGRAM_ADMINISTRATOR,
      institutionId: STANFORD,
      validationStatus: ValidationStatus.VALIDATED,
    });

    it('approves a student already resolved to their institution', async () => {
      target = makeUser({ id: 'stu-1', institutionId: STANFORD });

      await service.validate('stu-1', director, {});

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'stu-1' },
        expect.objectContaining({
          institutionId: STANFORD,
          validationStatus: ValidationStatus.VALIDATED,
          validationMethod: ValidationMethod.MANUAL,
          validatedById: 'dir-1',
          requestedInstitutionId: null,
        }),
      );
    });

    it('approves a student who asked to join their institution', async () => {
      target = makeUser({ id: 'stu-2', requestedInstitutionId: STANFORD });

      await service.validate('stu-2', director, {});

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'stu-2' },
        expect.objectContaining({ institutionId: STANFORD }),
      );
    });

    it('refuses a student from another institution', async () => {
      target = makeUser({ id: 'stu-3', institutionId: HARVARD });

      await expect(service.validate('stu-3', director, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('refuses an unaffiliated student', async () => {
      target = makeUser({ id: 'stu-4' });

      await expect(service.validate('stu-4', director, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('validates another program administrator at their own institution', async () => {
      target = makeUser({
        id: 'dir-2',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
      });

      await service.validate('dir-2', director, {});

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'dir-2' },
        expect.objectContaining({ institutionId: STANFORD }),
      );
    });

    it('refuses to validate a super user', async () => {
      // Platform staff are approved by platform staff. This is the one rank a local
      // administrator cannot hand out, because it is not local.
      target = makeUser({
        id: 'su-1',
        role: UserRole.SUPER_USER,
        institutionId: STANFORD,
      });

      await expect(service.validate('su-1', director, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('refuses a program administrator who has not been approved yet', async () => {
      // Signing up on a recognised domain attaches the institution immediately while
      // the rank itself still waits on an admin. Without this rule the role approves
      // itself: claim it, and start admitting people at that institution.
      const unapproved = makeUser({
        id: 'dir-new',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
        validationStatus: ValidationStatus.PENDING,
      });
      target = makeUser({ id: 'stu-x', institutionId: STANFORD });

      await expect(service.validate('stu-x', unapproved, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('validates an attending physician at their own institution', async () => {
      target = makeUser({
        id: 'att-1',
        role: UserRole.ATTENDING_PHYSICIAN,
        institutionId: STANFORD,
      });

      await service.validate('att-1', director, {});

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'att-1' },
        expect.objectContaining({ institutionId: STANFORD }),
      );
    });

    it('still cannot approve the first administrator at an institution', async () => {
      // The bootstrap rule, and it needs no check of its own: reaching the scope
      // test at all requires a *validated* administrator at that institution, so
      // the first one anywhere has nobody local who could let them in.
      const unapprovedPeer = makeUser({
        id: 'dir-first',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: HARVARD,
        validationStatus: ValidationStatus.PENDING,
      });
      target = makeUser({
        id: 'dir-second',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: HARVARD,
      });

      await expect(
        service.validate('dir-second', unapprovedPeer, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('validates a resident and a fellow, not just a medical student', async () => {
      for (const role of [UserRole.RESIDENT, UserRole.FELLOW]) {
        repo.update.mockClear();
        target = makeUser({ id: `t-${role}`, role, institutionId: STANFORD });

        await service.validate(`t-${role}`, director, {});

        expect(repo.update).toHaveBeenCalledWith(
          { id: `t-${role}` },
          expect.objectContaining({ institutionId: STANFORD }),
        );
      }
    });

    it('refuses to redirect a student into a different institution', async () => {
      target = makeUser({ id: 'stu-5', institutionId: STANFORD });

      await expect(
        service.validate('stu-5', director, { institutionId: HARVARD }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses when the director belongs nowhere', async () => {
      const homeless = makeUser({
        id: 'dir-3',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: null,
      });
      target = makeUser({ id: 'stu-6', institutionId: STANFORD });

      await expect(service.validate('stu-6', homeless, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('validate — admin', () => {
    const admin = makeUser({ id: 'admin-1', role: UserRole.SUPER_USER });

    it('can validate a program administrator', async () => {
      target = makeUser({
        id: 'dir-9',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
      });

      await service.validate('dir-9', admin, {});

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'dir-9' },
        expect.objectContaining({ institutionId: STANFORD }),
      );
    });

    it('can attach an unaffiliated person to any institution', async () => {
      target = makeUser({ id: 'stu-9' });

      await service.validate('stu-9', admin, { institutionId: HARVARD });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'stu-9' },
        expect.objectContaining({ institutionId: HARVARD }),
      );
    });

    it('refuses when there is no institution to attach to', async () => {
      target = makeUser({ id: 'stu-10' });

      await expect(service.validate('stu-10', admin, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to validate somebody twice', async () => {
      target = makeUser({
        id: 'stu-11',
        institutionId: STANFORD,
        validationStatus: ValidationStatus.VALIDATED,
      });

      await expect(service.validate('stu-11', admin, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    const director = makeUser({
      id: 'dir-1',
      role: UserRole.PROGRAM_ADMINISTRATOR,
      institutionId: STANFORD,
      validationStatus: ValidationStatus.VALIDATED,
    });

    it('records the reason and keeps the request for the audit trail', async () => {
      target = makeUser({ id: 'stu-1', requestedInstitutionId: STANFORD });

      await service.reject('stu-1', director, { reason: 'Not enrolled' });

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch.validationStatus).toBe(ValidationStatus.REJECTED);
      expect(patch.validationNote).toBe('Not enrolled');
      expect(patch).not.toHaveProperty('requestedInstitutionId');
    });

    it('applies the same scoping as validate', async () => {
      target = makeUser({ id: 'stu-2', institutionId: HARVARD });

      await expect(service.reject('stu-2', director, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('admin self-protection', () => {
    it('refuses to let an admin change their own role', async () => {
      await expect(
        service.setRole('admin-1', UserRole.MEDICAL_STUDENT, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to let an admin suspend themselves', async () => {
      await expect(
        service.setStatus('admin-1', UserStatus.SUSPENDED, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows acting on somebody else', async () => {
      target = makeUser({ id: 'other' });
      await service.setRole('other', UserRole.PROGRAM_ADMINISTRATOR, 'admin-1');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'other' },
        { role: UserRole.PROGRAM_ADMINISTRATOR },
      );
    });
  });

  describe('a super user belongs to no institution', () => {
    it('detaches the account when somebody is promoted', async () => {
      target = makeUser({ id: 'other', institutionId: STANFORD });

      await service.setRole('other', UserRole.SUPER_USER, 'admin-1');

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'other' },
        {
          role: UserRole.SUPER_USER,
          institutionId: null,
          requestedInstitutionId: null,
        },
      );
    });

    it('ends the affiliation rather than deleting it', async () => {
      // They really were there. The dates are part of the record, and a past
      // affiliation still grants access to that institution's material.
      target = makeUser({ id: 'other', institutionId: STANFORD });
      const open = { id: 'aff-1', institutionId: STANFORD, endedAt: null };
      affiliationRepo.find.mockResolvedValue([open]);

      await service.setRole('other', UserRole.SUPER_USER, 'admin-1');

      expect(affiliationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'aff-1', endedAt: expect.any(Date) }),
      );
    });

    it('leaves affiliations alone for any other rank', async () => {
      target = makeUser({ id: 'other', institutionId: STANFORD });

      await service.setRole('other', UserRole.FELLOW, 'admin-1');

      expect(affiliationRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to assign one an institution', async () => {
      target = makeUser({ id: 'su', role: UserRole.SUPER_USER });

      await expect(service.assignInstitution('su', STANFORD)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('still lets one be detached explicitly', async () => {
      target = makeUser({ id: 'su', role: UserRole.SUPER_USER });

      await service.assignInstitution('su', null);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'su' },
        { institutionId: null },
      );
    });

    it('refuses to validate one into an institution', async () => {
      // Validation decides whether somebody belongs to an institution, and this
      // rank does not belong to one. There is nothing to approve.
      const admin = makeUser({ id: 'admin-1', role: UserRole.SUPER_USER });
      target = makeUser({
        id: 'su-2',
        role: UserRole.SUPER_USER,
        institutionId: STANFORD,
      });

      await expect(service.validate('su-2', admin, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('countPendingValidation', () => {
    it('counts everything for an admin', async () => {
      const admin = makeUser({ id: 'a', role: UserRole.SUPER_USER });
      await service.countPendingValidation(admin);

      expect(repo.count).toHaveBeenCalledWith({
        where: [{ validationStatus: ValidationStatus.PENDING }],
      });
    });

    it('counts only their own institution for a director', async () => {
      const director = makeUser({
        id: 'd',
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
        validationStatus: ValidationStatus.VALIDATED,
      });
      await service.countPendingValidation(director);

      const [{ where }] = repo.count.mock.calls[0] as [{ where: unknown[] }];
      expect(where).toHaveLength(2);
      expect(where).toEqual([
        expect.objectContaining({
          institutionId: STANFORD,
          role: Not(UserRole.SUPER_USER),
        }),
        expect.objectContaining({
          requestedInstitutionId: STANFORD,
          role: Not(UserRole.SUPER_USER),
        }),
      ]);
    });

    it('returns zero for a student without hitting the database', async () => {
      const student = makeUser({ role: UserRole.MEDICAL_STUDENT });
      await expect(service.countPendingValidation(student)).resolves.toBe(0);
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('returns zero for a director with no institution', async () => {
      const director = makeUser({
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: null,
        validationStatus: ValidationStatus.VALIDATED,
      });
      await expect(service.countPendingValidation(director)).resolves.toBe(0);
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('returns zero for a director who is not approved yet', async () => {
      // The queue is empty rather than forbidden: showing a list and refusing every
      // action on it would read as broken rather than as pending.
      const director = makeUser({
        role: UserRole.PROGRAM_ADMINISTRATOR,
        institutionId: STANFORD,
        validationStatus: ValidationStatus.PENDING,
      });
      await expect(service.countPendingValidation(director)).resolves.toBe(0);
      expect(repo.count).not.toHaveBeenCalled();
    });
  });

  describe('markEmailVerified', () => {
    it('activates an account that was waiting on verification', async () => {
      target = makeUser({
        id: 'u',
        emailVerifiedAt: null,
        status: UserStatus.PENDING_EMAIL_VERIFICATION,
      });

      await service.markEmailVerified('u');

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch.status).toBe(UserStatus.ACTIVE);
      expect(patch.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('does not resurrect a suspended account', async () => {
      target = makeUser({
        id: 'u',
        emailVerifiedAt: null,
        status: UserStatus.SUSPENDED,
      });

      await service.markEmailVerified('u');

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch).not.toHaveProperty('status');
    });

    it('is a no-op when the address is already verified', async () => {
      target = makeUser({ id: 'u', emailVerifiedAt: new Date() });

      await service.markEmailVerified('u');

      expect(repo.update).not.toHaveBeenCalled();
    });
  });
  describe('affiliations', () => {
    it('reopens an ended affiliation rather than inserting a second row', async () => {
      const ended = {
        id: 'aff-1',
        userId: 'u',
        institutionId: STANFORD,
        institutionalEmail: 'old@stanford.edu',
        endedAt: new Date('2025-01-01'),
      };
      affiliationRepo.findOne.mockResolvedValue(ended);

      await service.openAffiliation('u', STANFORD, 'new@stanford.edu');

      expect(affiliationRepo.create).not.toHaveBeenCalled();
      const [saved] = affiliationRepo.save.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(saved.id).toBe('aff-1');
      expect(saved.endedAt).toBeNull();
      expect(saved.institutionalEmail).toBe('new@stanford.edu');
      expect(saved.emailDomain).toBe('stanford.edu');
    });

    it('closes the affiliations somebody is leaving and keeps the one they join', async () => {
      affiliationRepo.find.mockResolvedValue([
        { id: 'a', institutionId: STANFORD, endedAt: null },
        { id: 'b', institutionId: HARVARD, endedAt: null },
      ]);

      await service.endOtherAffiliations('u', HARVARD);

      const saved = affiliationRepo.save.mock.calls.map(
        ([value]) => value as Record<string, unknown>,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('a');
      expect(saved[0].endedAt).toBeInstanceOf(Date);
    });

    it('moving institution ends the old affiliation and opens the new one', async () => {
      target = makeUser({ id: 'u', institutionId: STANFORD });
      affiliationRepo.find.mockResolvedValue([
        { id: 'a', institutionId: STANFORD, endedAt: null },
      ]);

      await service.moveInstitution('u', {
        email: 'Ana@Harvard.EDU',
        institutionId: HARVARD,
        requestedInstitutionId: null,
        autoValidated: true,
      });

      const [, patch] = repo.update.mock.calls[0] as [unknown, Partial<User>];
      expect(patch.email).toBe('ana@harvard.edu');
      expect(patch.emailDomain).toBe('harvard.edu');
      // A different mailbox, so nobody has proved they can read this one.
      expect(patch.emailVerifiedAt).toBeNull();
      expect(patch.validationStatus).toBe(ValidationStatus.VALIDATED);
      expect(patch.validationMethod).toBe(ValidationMethod.EMAIL_DOMAIN);

      const saved = affiliationRepo.save.mock.calls.map(
        ([value]) => value as Record<string, unknown>,
      );
      expect(saved.find((row) => row.id === 'a')?.endedAt).toBeInstanceOf(Date);
      expect(
        saved.some((row) => row.institutionId === HARVARD && !row.endedAt),
      ).toBe(true);
    });
  });

  describe('needsPersonalEmail', () => {
    it('is true for a finished account with no personal address', () => {
      expect(makeUser({ personalEmail: null }).needsPersonalEmail).toBe(true);
    });

    it('is false while the profile is still being completed', () => {
      // They have not been asked yet — the signup form is where they will be.
      expect(
        makeUser({ status: UserStatus.PENDING_PROFILE, personalEmail: null })
          .needsPersonalEmail,
      ).toBe(false);
    });

    it('is false once there is one', () => {
      expect(
        makeUser({ personalEmail: 'ana@gmail.com' }).needsPersonalEmail,
      ).toBe(false);
    });
  });
});
