import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InstitutionsService } from './institutions.service';
import { Institution } from './entities/institution.entity';
import { InstitutionDomain } from './entities/institution-domain.entity';
import { normalizeDomain } from './dto/create-institution.dto';

describe('normalizeDomain', () => {
  it.each([
    ['@stanford.edu', 'stanford.edu'],
    ['Stanford.EDU', 'stanford.edu'],
    ['  @MED.Stanford.edu  ', 'med.stanford.edu'],
    ['stanford.edu.', 'stanford.edu'],
    ['@@stanford.edu', 'stanford.edu'],
  ])('turns %s into %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  let institutions: { find: jest.Mock; findOne: jest.Mock; exists: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let domains: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    institutions = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'i1', name: 'Test', domains: [] }),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'i1', ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    domains = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InstitutionsService,
        { provide: getRepositoryToken(Institution), useValue: institutions },
        { provide: getRepositoryToken(InstitutionDomain), useValue: domains },
      ],
    }).compile();

    service = moduleRef.get(InstitutionsService);
  });

  describe('create', () => {
    it('derives a slug from the name', async () => {
      await service.create({ name: 'Stanford University School of Medicine' });

      expect(institutions.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'stanford-university-school-of-medicine' }),
      );
    });

    it('strips accents when deriving the slug', async () => {
      await service.create({ name: 'Universidad de la República' });

      expect(institutions.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'universidad-de-la-republica' }),
      );
    });

    it('normalizes and de-duplicates the domains it is given', async () => {
      await service.create({
        name: 'Test',
        domains: ['@Stanford.edu', 'stanford.edu', 'MED.stanford.edu'],
      });

      const [payload] = institutions.create.mock.calls[0] as [
        { domains: { domain: string }[] },
      ];
      expect(payload.domains).toEqual([
        { domain: 'stanford.edu' },
        { domain: 'med.stanford.edu' },
      ]);
    });

    it('refuses a slug that is already taken', async () => {
      institutions.exists.mockResolvedValue(true);

      await expect(service.create({ name: 'Test' })).rejects.toThrow(ConflictException);
    });

    it('refuses a domain that belongs to another institution', async () => {
      domains.find.mockResolvedValue([
        { domain: 'stanford.edu', institution: { name: 'Stanford' } },
      ]);

      await expect(
        service.create({ name: 'Copycat', domains: ['stanford.edu'] }),
      ).rejects.toThrow(ConflictException);
    });

    it('names the conflicting institution in the error', async () => {
      domains.find.mockResolvedValue([
        { domain: 'stanford.edu', institution: { name: 'Stanford' } },
      ]);

      await expect(
        service.create({ name: 'Copycat', domains: ['stanford.edu'] }),
      ).rejects.toThrow(/Stanford/);
    });
  });

  describe('findByEmailDomain', () => {
    it('resolves a known domain to its institution', async () => {
      const institution = { id: 'i1', name: 'Stanford', isActive: true };
      domains.findOne.mockResolvedValue({ domain: 'stanford.edu', institution });

      await expect(service.findByEmailDomain('Stanford.EDU')).resolves.toBe(institution);
    });

    it('returns null for an unknown domain', async () => {
      await expect(service.findByEmailDomain('gmail.com')).resolves.toBeNull();
    });

    it('does not auto-validate into a paused institution', async () => {
      domains.findOne.mockResolvedValue({
        domain: 'stanford.edu',
        institution: { id: 'i1', name: 'Stanford', isActive: false },
      });

      await expect(service.findByEmailDomain('stanford.edu')).resolves.toBeNull();
    });

    it('returns null for an empty domain without querying', async () => {
      await expect(service.findByEmailDomain('')).resolves.toBeNull();
      expect(domains.findOne).not.toHaveBeenCalled();
    });
  });

  describe('removeDomain', () => {
    it('scopes the delete to the owning institution', async () => {
      await service.removeDomain('i1', 'd1');

      expect(domains.delete).toHaveBeenCalledWith({ id: 'd1', institutionId: 'i1' });
    });

    it('404s when the domain does not belong to that institution', async () => {
      domains.delete.mockResolvedValue({ affected: 0 });

      await expect(service.removeDomain('i1', 'd1')).rejects.toThrow(NotFoundException);
    });
  });
});
