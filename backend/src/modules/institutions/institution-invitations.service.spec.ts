import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InstitutionInvitationsService } from './institution-invitations.service';
import { InstitutionInvitation } from './entities/institution-invitation.entity';
import { Institution } from './entities/institution.entity';
import { MailerService } from '../mail/mailer.service';

const STANFORD = 'inst-stanford';
const HOUR = 3_600_000;

const makeInstitution = (overrides: Partial<Institution> = {}): Institution =>
  ({ id: STANFORD, name: 'Stanford', isActive: true, ...overrides }) as Institution;

/**
 * `isPending` and `isExpired` are getters on the entity, so a plain object has to
 * carry them or every check that reads one silently sees undefined.
 */
const makeInvitation = (
  overrides: Partial<InstitutionInvitation> = {},
): InstitutionInvitation => {
  const row = {
    id: 'inv-1',
    institutionId: STANFORD,
    email: 'director@stanford.edu',
    tokenHash: 'whatever',
    invitedById: 'admin-1',
    expiresAt: new Date(Date.now() + 24 * HOUR),
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as InstitutionInvitation;

  Object.defineProperties(row, {
    isPending: {
      get: () =>
        row.acceptedAt === null &&
        row.revokedAt === null &&
        row.expiresAt.getTime() > Date.now(),
    },
    isExpired: {
      get: () =>
        row.acceptedAt === null &&
        row.revokedAt === null &&
        row.expiresAt.getTime() <= Date.now(),
    },
  });

  return row;
};

describe('InstitutionInvitationsService', () => {
  let service: InstitutionInvitationsService;
  let invitations: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let institutions: { findOne: jest.Mock };
  let mailer: { send: jest.Mock };

  beforeEach(async () => {
    invitations = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn((options: { where: { id: string } }) =>
        Promise.resolve(makeInvitation({ id: options.where.id })),
      ),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) =>
        Promise.resolve(makeInvitation(data as Partial<InstitutionInvitation>)),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    institutions = { findOne: jest.fn().mockResolvedValue(makeInstitution()) };
    mailer = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InstitutionInvitationsService,
        {
          provide: getRepositoryToken(InstitutionInvitation),
          useValue: invitations,
        },
        { provide: getRepositoryToken(Institution), useValue: institutions },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'https://eyelecture.test',
            get: () => 'test',
          },
        },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = moduleRef.get(InstitutionInvitationsService);
  });

  describe('invite', () => {
    it('stores only the hash and puts the token in the link', async () => {
      const { invitation, link } = await service.invite(
        STANFORD,
        'Director@Stanford.EDU',
        'admin-1',
      );

      const token = new URL(link).searchParams.get('token');
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      const [saved] = invitations.save.mock.calls[0] as [
        Partial<InstitutionInvitation>,
      ];
      expect(saved.tokenHash).toBe(
        createHash('sha256').update(token!).digest('hex'),
      );
      // The readable token must not be anywhere in the row.
      expect(JSON.stringify(saved)).not.toContain(token);
      expect(invitation.institutionId).toBe(STANFORD);
    });

    it('lowercases the address, so one mailbox cannot be invited twice', async () => {
      await service.invite(STANFORD, '  Director@Stanford.EDU ', 'admin-1');

      const [saved] = invitations.save.mock.calls[0] as [
        Partial<InstitutionInvitation>,
      ];
      expect(saved.email).toBe('director@stanford.edu');
    });

    it('sends the invitation to that address', async () => {
      await service.invite(STANFORD, 'director@stanford.edu', 'admin-1');

      const [mail] = mailer.send.mock.calls[0] as [{ to: string; subject: string }];
      expect(mail.to).toBe('director@stanford.edu');
      expect(mail.subject).toContain('Stanford');
    });

    it('refuses a second invitation while the first is still live', async () => {
      invitations.findOne.mockResolvedValue(makeInvitation());

      await expect(
        service.invite(STANFORD, 'director@stanford.edu', 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(invitations.save).not.toHaveBeenCalled();
    });

    it('withdraws a stale one and issues a fresh link', async () => {
      // The partial unique index cannot see the clock, so an expired row still
      // occupies the slot. It has to be stood down before the new one lands.
      invitations.findOne.mockResolvedValue(
        makeInvitation({ id: 'old', expiresAt: new Date(Date.now() - HOUR) }),
      );

      await service.invite(STANFORD, 'director@stanford.edu', 'admin-1');

      expect(invitations.update).toHaveBeenCalledWith(
        { id: 'old' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(invitations.save).toHaveBeenCalled();
    });

    it('turns a unique-violation into the same 409 as the pre-check', async () => {
      // Two super users inviting the same address at once get past the check above
      // and collide on the partial index. The index is the real rule; this is what
      // keeps the collision from surfacing as a 500 describing a database.
      invitations.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        service.invite(STANFORD, 'director@stanford.edu', 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('lets any other database error through untouched', async () => {
      invitations.save.mockRejectedValue(
        Object.assign(new Error('connection lost'), { code: '08006' }),
      );

      await expect(
        service.invite(STANFORD, 'director@stanford.edu', 'admin-1'),
      ).rejects.toThrow('connection lost');
    });

    it('refuses to hand over an inactive institution', async () => {
      institutions.findOne.mockResolvedValue(
        makeInstitution({ isActive: false }),
      );

      await expect(
        service.invite(STANFORD, 'director@stanford.edu', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('refuses an institution that does not exist', async () => {
      institutions.findOne.mockResolvedValue(null);

      await expect(
        service.invite(STANFORD, 'director@stanford.edu', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('stands down an invitation nobody took up', async () => {
      invitations.findOne.mockResolvedValue(makeInvitation());

      await service.revoke(STANFORD, 'inv-1');

      expect(invitations.update).toHaveBeenCalledWith(
        { id: 'inv-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('refuses to withdraw one that was already accepted', async () => {
      // Withdrawing it would suggest the account it created goes away with it.
      invitations.findOne.mockResolvedValue(
        makeInvitation({ acceptedAt: new Date(), acceptedByUserId: 'u-1' }),
      );

      await expect(service.revoke(STANFORD, 'inv-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(invitations.update).not.toHaveBeenCalled();
    });

    it('is quiet about one that is already withdrawn', async () => {
      invitations.findOne.mockResolvedValue(
        makeInvitation({ revokedAt: new Date(Date.now() - HOUR) }),
      );

      await expect(service.revoke(STANFORD, 'inv-1')).resolves.toBeDefined();
      expect(invitations.update).not.toHaveBeenCalled();
    });
  });

  describe('findLiveByToken', () => {
    it('looks the token up by its hash, never by the token', async () => {
      invitations.findOne.mockResolvedValue(
        makeInvitation({ institution: makeInstitution() }),
      );

      await service.findLiveByToken('plain-token');

      const [options] = invitations.findOne.mock.calls[0] as [
        { where: { tokenHash: string } },
      ];
      expect(options.where.tokenHash).toBe(
        createHash('sha256').update('plain-token').digest('hex'),
      );
    });

    it.each([
      ['unknown', null],
      ['spent', makeInvitation({ acceptedAt: new Date() })],
      ['withdrawn', makeInvitation({ revokedAt: new Date() })],
      ['stale', makeInvitation({ expiresAt: new Date(Date.now() - HOUR) })],
    ])('refuses a %s token with the same message', async (_label, row) => {
      // Deliberately indistinguishable. Telling a stranger holding a bad token
      // which kind of bad it is describes somebody else's invitation to them.
      invitations.findOne.mockResolvedValue(row);

      await expect(service.findLiveByToken('t')).rejects.toThrow(
        'This invitation link is no longer valid',
      );
    });
  });

  describe('markAccepted', () => {
    it('only spends an invitation that has not been spent', async () => {
      await service.markAccepted('inv-1', 'user-9');

      const [where, patch] = invitations.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      // The acceptedAt IS NULL in the filter is what makes a double submit land
      // on zero rows instead of reassigning the invitation to a second account.
      expect(where).toHaveProperty('acceptedAt');
      expect(patch.acceptedByUserId).toBe('user-9');
    });
  });
});
