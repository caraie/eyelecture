import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { InstitutionInvitation } from './entities/institution-invitation.entity';
import { Institution } from './entities/institution.entity';
import { MailerService } from '../mail/mailer.service';
import { invitedToAdminister } from '../mail/templates';

/** Hashed for the same reason sessions are: a dump should not be a pile of links. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const normalize = (email: string): string => email.trim().toLowerCase();

/**
 * Postgres 23505, read off the error's code rather than matched on its message.
 * TypeORM wraps the driver error but keeps the original on `driverError`, and which
 * of the two carries the code varies by version — so both are checked.
 */
const isUniqueViolation = (error: unknown): boolean => {
  const candidates = [
    error,
    (error as { driverError?: unknown } | null)?.driverError,
  ];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: string }).code === '23505',
  );
};

/** A fortnight. Long enough to survive a holiday, short enough to still mean now. */
const INVITATION_TTL_DAYS = 14;

@Injectable()
export class InstitutionInvitationsService {
  private readonly logger = new Logger(InstitutionInvitationsService.name);

  constructor(
    @InjectRepository(InstitutionInvitation)
    private readonly invitations: Repository<InstitutionInvitation>,
    @InjectRepository(Institution)
    private readonly institutions: Repository<Institution>,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Every invitation this institution has ever sent, newest first.
   *
   * Spent and withdrawn ones are included rather than filtered out: "did we ever ask
   * this person, and what came of it" is the question somebody actually has three
   * months later, and a list that only shows what is outstanding cannot answer it.
   */
  findFor(institutionId: string): Promise<InstitutionInvitation[]> {
    return this.invitations.find({
      where: { institutionId },
      relations: { invitedBy: true, acceptedBy: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Invite somebody to administer this institution.
   *
   * The returned token is the only time it exists in readable form — it goes into the
   * link, and what is kept is its hash. It is also returned to the caller, so a
   * development build with mail switched off can still show the link on screen
   * rather than sending the super user to the server log.
   */
  async invite(
    institutionId: string,
    rawEmail: string,
    invitedById: string,
  ): Promise<{ invitation: InstitutionInvitation; link: string }> {
    const institution = await this.institutions.findOne({
      where: { id: institutionId },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    if (!institution.isActive) {
      // An inactive institution has stopped taking people in. Handing somebody the
      // keys to it would be the one thing that still works, which is confusing
      // rather than useful.
      throw new BadRequestException(
        'This institution is inactive — reactivate it before inviting anyone',
      );
    }

    const email = normalize(rawEmail);

    // An expired invitation is not in anybody's way, but the partial unique index
    // does not know about the clock, so it still occupies the slot. Withdraw it
    // first and the new one lands cleanly.
    const existing = await this.invitations.findOne({
      where: { institutionId, email, acceptedAt: IsNull(), revokedAt: IsNull() },
    });
    if (existing) {
      if (existing.isPending) {
        throw new ConflictException(
          'That address already has an invitation waiting. Withdraw it first to send a new one.',
        );
      }
      await this.invitations.update(
        { id: existing.id },
        { revokedAt: new Date() },
      );
    }

    const token = randomBytes(32).toString('hex');

    // The check above is a courtesy; the partial unique index is the actual rule.
    // Two super users inviting the same address at once would otherwise surface as
    // a 500, which describes a database and not what happened.
    let saved: InstitutionInvitation;
    try {
      saved = await this.invitations.save(
        this.invitations.create({
          institutionId,
          email,
          tokenHash: hashToken(token),
          invitedById,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'That address already has an invitation waiting. Withdraw it first to send a new one.',
        );
      }
      throw error;
    }

    // Reloaded with its relations, so the row the caller splices into the list
    // carries the same attribution as one that came from the list endpoint.
    const invitation = await this.invitations.findOneOrFail({
      where: { id: saved.id },
      relations: { invitedBy: true, acceptedBy: true },
    });

    const link = `${this.config.getOrThrow<string>(
      'app.frontendUrl',
    )}/auth/invitation?token=${token}`;

    // Deliberately *not* logged in production, which is where this parts company
    // with the email-verification links. Those confirm an address on an account
    // somebody already made; this one creates a validated program administrator at
    // a named institution out of nothing, so anybody who can read the log could
    // spend it. Off production the log is the whole flow, so it stays.
    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.logger.log(`Invitation link for ${email} (${institution.name}): ${link}`);
    } else {
      this.logger.log(`Invitation issued for ${email} (${institution.name})`);
    }

    const rendered = invitedToAdminister(institution.name, link, INVITATION_TTL_DAYS);
    await this.mailer.send(
      { to: email, ...rendered },
      `institution invitation (${institution.name})`,
    );

    return { invitation, link };
  }

  async revoke(
    institutionId: string,
    invitationId: string,
  ): Promise<InstitutionInvitation> {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId, institutionId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    if (invitation.acceptedAt) {
      // Withdrawing it now would suggest the account it created goes away with it.
      // It does not, and that account is a real administrator — remove them through
      // People if that is what is wanted.
      throw new BadRequestException(
        'This invitation was already accepted. Change that account in People instead.',
      );
    }

    if (!invitation.revokedAt) {
      await this.invitations.update(
        { id: invitation.id },
        { revokedAt: new Date() },
      );
    }

    return this.invitations.findOneOrFail({
      where: { id: invitation.id },
      relations: { invitedBy: true, acceptedBy: true },
    });
  }

  /**
   * Resolve a link back to its invitation, refusing anything that is not live.
   *
   * Every failure is the same message on purpose. Telling the holder of a bad token
   * whether it was never real, already spent or merely stale describes the state of
   * somebody else's invitation to a stranger.
   */
  async findLiveByToken(token: string): Promise<InstitutionInvitation> {
    const invitation = await this.invitations.findOne({
      where: { tokenHash: hashToken(token) },
      relations: { institution: true },
    });

    if (!invitation || !invitation.isPending) {
      throw new NotFoundException('This invitation link is no longer valid');
    }

    return invitation;
  }

  async markAccepted(
    invitationId: string,
    userId: string,
  ): Promise<void> {
    await this.invitations.update(
      { id: invitationId, acceptedAt: IsNull() },
      { acceptedAt: new Date(), acceptedByUserId: userId },
    );
  }
}
