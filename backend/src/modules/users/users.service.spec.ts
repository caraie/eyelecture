import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { UsersService, emailDomainOf, normalizeEmail } from './users.service';
import { User } from './entities/user.entity';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity';
import { InstitutionsService } from '../institutions/institutions.service';
import { TRAINEE_ROLES, UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { ValidationMethod, ValidationStatus } from './enums/validation-status.enum';

const STANFORD = 'inst-stanford';
const HARVARD = 'inst-harvard';

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
    ...overrides,
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
  let institutions: { findByEmailDomain: jest.Mock };

  beforeEach(async () => {
    target = makeUser();

    tokenRepo = { delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    institutions = { findByEmailDomain: jest.fn().mockResolvedValue(null) };

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

  describe('validate — residency administrator scoping', () => {
    const director = makeUser({
      id: 'dir-1',
      role: UserRole.RESIDENCY_ADMINISTRATOR,
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

    it('refuses to validate another residency administrator', async () => {
      target = makeUser({
        id: 'dir-2',
        role: UserRole.RESIDENCY_ADMINISTRATOR,
        institutionId: STANFORD,
      });

      await expect(service.validate('dir-2', director, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses to validate an attending physician', async () => {
      // Same institution, so scope is not what stops this — rank is. Attendings are
      // reviewed by platform staff, or the role becomes self-propagating.
      target = makeUser({
        id: 'att-1',
        role: UserRole.ATTENDING_PHYSICIAN,
        institutionId: STANFORD,
      });

      await expect(service.validate('att-1', director, {})).rejects.toThrow(
        ForbiddenException,
      );
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
        role: UserRole.RESIDENCY_ADMINISTRATOR,
        institutionId: null,
      });
      target = makeUser({ id: 'stu-6', institutionId: STANFORD });

      await expect(service.validate('stu-6', homeless, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('validate — admin', () => {
    const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });

    it('can validate a residency administrator', async () => {
      target = makeUser({
        id: 'dir-9',
        role: UserRole.RESIDENCY_ADMINISTRATOR,
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
      role: UserRole.RESIDENCY_ADMINISTRATOR,
      institutionId: STANFORD,
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
      await service.setRole('other', UserRole.RESIDENCY_ADMINISTRATOR, 'admin-1');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'other' },
        { role: UserRole.RESIDENCY_ADMINISTRATOR },
      );
    });
  });

  describe('countPendingValidation', () => {
    it('counts everything for an admin', async () => {
      const admin = makeUser({ id: 'a', role: UserRole.ADMIN });
      await service.countPendingValidation(admin);

      expect(repo.count).toHaveBeenCalledWith({
        where: [{ validationStatus: ValidationStatus.PENDING }],
      });
    });

    it('counts only their own institution for a director', async () => {
      const director = makeUser({
        id: 'd',
        role: UserRole.RESIDENCY_ADMINISTRATOR,
        institutionId: STANFORD,
      });
      await service.countPendingValidation(director);

      const [{ where }] = repo.count.mock.calls[0] as [{ where: unknown[] }];
      expect(where).toHaveLength(2);
      expect(where).toEqual([
        expect.objectContaining({
          institutionId: STANFORD,
          role: In([...TRAINEE_ROLES]),
        }),
        expect.objectContaining({
          requestedInstitutionId: STANFORD,
          role: In([...TRAINEE_ROLES]),
        }),
      ]);
    });

    it('does not count attendings or other administrators', () => {
      // The scoped query asks for trainee ranks only. Anyone senior to that is
      // reviewed by platform staff, so they must not appear in this count.
      expect([...TRAINEE_ROLES]).toEqual([
        UserRole.MEDICAL_STUDENT,
        UserRole.RESIDENT,
        UserRole.FELLOW,
      ]);
    });

    it('returns zero for a student without hitting the database', async () => {
      const student = makeUser({ role: UserRole.MEDICAL_STUDENT });
      await expect(service.countPendingValidation(student)).resolves.toBe(0);
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('returns zero for a director with no institution', async () => {
      const director = makeUser({
        role: UserRole.RESIDENCY_ADMINISTRATOR,
        institutionId: null,
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
});
