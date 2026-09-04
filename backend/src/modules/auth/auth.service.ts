import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { UsersService, emailDomainOf } from '../users/users.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { User } from '../users/entities/user.entity';
import { TRAINEE_ROLES, UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../users/enums/validation-status.enum';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { VerificationPurpose } from './enums/verification-purpose.enum';
import { RegisterDto } from './dto/register.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  AuthTokensDto,
  CompleteProfileResponseDto,
} from './dto/token.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { MailerService } from '../mail/mailer.service';
import { verifyPrimaryEmail, verifySecondaryEmail } from '../mail/templates';

const BCRYPT_ROUNDS = 12;

/** Stored hashed so a database dump cannot be replayed as a session. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly institutions: InstitutionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokens: Repository<EmailVerificationToken>,
    private readonly mailer: MailerService,
  ) {}

  // --- Registration -----------------------------------------------------------

  /**
   * Step one: a name, a username and a password, and nothing else.
   *
   * The account exists from here on, but in a state where the only thing it can do
   * is finish the job — there is no rank, no address, and so no membership question
   * to answer yet. All of that is `completeProfile`.
   */
  async register(
    dto: RegisterDto,
    context: SessionContext = {},
  ): Promise<AuthResponseDto> {
    if (await this.users.usernameInUse(dto.username)) {
      throw new ConflictException('That username is already taken');
    }

    const user = await this.users.create({
      username: dto.username,
      // No address yet, and no placeholder either — a NULL is what every "has this
      // person finished signing up?" check is going to look for.
      email: null,
      emailDomain: null,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      firstName: dto.firstName,
      lastName: dto.lastName,
      status: UserStatus.PENDING_PROFILE,
    });

    // Signed in straight away. The next screen is the other half of the same form,
    // and a login page in the middle of one flow is where people fall out of it.
    return this.buildAuthResponse(user, context);
  }

  /**
   * Step two. Decides membership from the address, then sends the verification mail
   * — which is only possible now, because this is the first point at which we have
   * somewhere to send it.
   */
  async completeProfile(
    userId: string,
    dto: CompleteProfileDto,
  ): Promise<CompleteProfileResponseDto> {
    const current = await this.users.findByIdOrFail(userId);
    if (current.status !== UserStatus.PENDING_PROFILE) {
      throw new BadRequestException('This profile has already been completed');
    }

    if (await this.users.emailInUse(dto.email, userId)) {
      throw new ConflictException('An account with this email already exists');
    }

    const secondaryEmail = await this.users.assertSecondaryEmailAllowed(
      dto.secondaryEmail,
      dto.email,
      userId,
    );

    const matched = await this.institutions.findByEmailDomain(
      emailDomainOf(dto.email),
    );

    // Only trainees are let in by their address alone. An attending physician is
    // expected to use a personal one, and a residency administrator vouches for
    // other people — neither is something a domain match can establish.
    const autoValidated = matched !== null && TRAINEE_ROLES.includes(dto.role);

    const user = await this.users.completeProfile(userId, {
      role: dto.role,
      email: dto.email,
      secondaryEmail,
      institutionId: matched?.id ?? null,
      requestedInstitutionId: matched ? null : (dto.requestedInstitutionId ?? null),
      autoValidated,
    });

    const verificationToken = await this.issueEmailVerificationToken(user);

    return {
      user: UserResponseDto.from(user),
      autoValidated,
      message: this.profileMessage(user, matched?.name ?? null, autoValidated),
      ...(this.isProduction()
        ? {}
        : { devEmailVerificationToken: verificationToken }),
    };
  }

  private profileMessage(
    user: User,
    institutionName: string | null,
    autoValidated: boolean,
  ): string {
    if (autoValidated && institutionName) {
      return `Your address belongs to ${institutionName}, so your membership is already confirmed. Check your email to activate your account.`;
    }
    if (user.role === UserRole.RESIDENCY_ADMINISTRATOR) {
      return 'Check your email to activate your account. An administrator will review your residency administrator request.';
    }
    if (user.role === UserRole.ATTENDING_PHYSICIAN) {
      return 'Check your email to activate your account. An administrator will confirm your membership.';
    }
    return 'Check your email to activate your account. Because your address is not on a known institution domain, someone needs to confirm your membership.';
  }

  // --- Email verification -----------------------------------------------------

  private async issueEmailVerificationToken(
    user: User,
    purpose: VerificationPurpose = VerificationPurpose.PRIMARY_EMAIL,
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const ttlHours = this.config.getOrThrow<number>(
      'app.emailVerificationTtlHours',
    );

    const isSecondary = purpose === VerificationPurpose.SECONDARY_EMAIL;
    const targetEmail = isSecondary ? user.secondaryEmail : user.email;

    if (!targetEmail) {
      throw new BadRequestException('There is no address to send a link to');
    }

    await this.verificationTokens.save(
      this.verificationTokens.create({
        tokenHash: hashToken(token),
        userId: user.id,
        purpose,
        targetEmail,
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      }),
    );

    const path = isSecondary
      ? '/app/profile/confirm-personal-email'
      : '/auth/verify-email';
    const link = `${this.config.getOrThrow<string>('app.frontendUrl')}${path}?token=${token}`;

    // Still logged, always. When mail is off this is the whole flow; when it is on
    // it is how you find the link again for a message that bounced or was dropped.
    this.logger.log(`Email verification link for ${targetEmail}: ${link}`);

    const rendered = isSecondary
      ? verifySecondaryEmail(user.firstName, link)
      : verifyPrimaryEmail(user.firstName, link);

    // Awaited but never throws — see MailerService.send. A signup must not fail
    // because a mail provider is having a bad afternoon.
    await this.mailer.send(
      { to: targetEmail, ...rendered },
      isSecondary ? 'personal address confirmation' : 'email verification',
    );

    return token;
  }

  /**
   * Redeems a token, checking that it was minted for the purpose being claimed.
   * Everything past this point can assume the token is fresh and single-use.
   */
  private async consumeVerificationToken(
    token: string,
    purpose: VerificationPurpose,
  ): Promise<EmailVerificationToken> {
    const record = await this.verificationTokens.findOne({
      where: { tokenHash: hashToken(token) },
    });

    if (
      !record ||
      record.consumedAt ||
      record.expiresAt < new Date() ||
      record.purpose !== purpose
    ) {
      throw new UnauthorizedException(
        'This verification link is invalid or has expired',
      );
    }

    record.consumedAt = new Date();
    await this.verificationTokens.save(record);
    return record;
  }

  async verifyEmail(token: string): Promise<AuthResponseDto> {
    const record = await this.consumeVerificationToken(
      token,
      VerificationPurpose.PRIMARY_EMAIL,
    );

    const user = await this.users.findByIdOrFail(record.userId);

    // The address must still be the one the link was sent to. This matters more here
    // than on the secondary path, because succeeding also hands back a live session:
    // without the check, someone who registered an address they controlled, never
    // clicked, and then had an admin move the account to a different address, could
    // spend the stale link to verify that new address and sign in as the account.
    //
    // `targetEmail` is null only for tokens minted before the column existed; those
    // are allowed through rather than being broken by the upgrade.
    if (record.targetEmail !== null && record.targetEmail !== user.email) {
      throw new UnauthorizedException(
        'This link was sent to a different address than the one on the account now',
      );
    }

    const verified = await this.users.markEmailVerified(record.userId);
    return this.buildAuthResponse(verified);
  }

  // --- Secondary (personal) address -------------------------------------------

  /**
   * Set or replace the personal address on your own account, then send a
   * confirmation link. The address is live for sign-in immediately either way —
   * confirming it is about trusting the address, not about unlocking it.
   */
  async setSecondaryEmail(
    userId: string,
    secondaryEmail: string,
  ): Promise<{ user: UserResponseDto; devToken?: string }> {
    // setSecondaryEmail runs assertSecondaryEmailAllowed itself, so the rule is
    // applied whether the caller comes through here or straight to the service.
    const user = await this.users.setSecondaryEmail(userId, secondaryEmail);

    // Any link already in flight pointed at the previous address.
    await this.verificationTokens.delete({
      userId,
      purpose: VerificationPurpose.SECONDARY_EMAIL,
      consumedAt: IsNull(),
    });

    const token = await this.issueEmailVerificationToken(
      user,
      VerificationPurpose.SECONDARY_EMAIL,
    );

    return {
      user: UserResponseDto.from(user),
      ...(this.isProduction() ? {} : { devToken: token }),
    };
  }

  async removeSecondaryEmail(userId: string): Promise<UserResponseDto> {
    await this.verificationTokens.delete({
      userId,
      purpose: VerificationPurpose.SECONDARY_EMAIL,
      consumedAt: IsNull(),
    });
    return UserResponseDto.from(await this.users.clearSecondaryEmail(userId));
  }

  async resendSecondaryEmailVerification(
    userId: string,
  ): Promise<{ message: string; devToken?: string }> {
    const user = await this.users.findByIdOrFail(userId);

    if (!user.secondaryEmail) {
      throw new BadRequestException(
        'You have not added a personal address yet',
      );
    }
    if (user.secondaryEmailVerifiedAt) {
      throw new BadRequestException('That address is already confirmed');
    }

    await this.verificationTokens.delete({
      userId,
      purpose: VerificationPurpose.SECONDARY_EMAIL,
      consumedAt: IsNull(),
    });

    const token = await this.issueEmailVerificationToken(
      user,
      VerificationPurpose.SECONDARY_EMAIL,
    );

    return {
      message: `A confirmation link is on its way to ${user.secondaryEmail}.`,
      ...(this.isProduction() ? {} : { devToken: token }),
    };
  }

  /**
   * Confirm the personal address.
   *
   * The token records the address it was sent to. If the person has changed it since,
   * the old link must not confirm the new one, so a mismatch is treated as expired.
   */
  async verifySecondaryEmail(
    token: string,
  ): Promise<{ secondaryEmail: string; message: string }> {
    const record = await this.consumeVerificationToken(
      token,
      VerificationPurpose.SECONDARY_EMAIL,
    );

    const user = await this.users.findByIdOrFail(record.userId);

    if (!user.secondaryEmail || user.secondaryEmail !== record.targetEmail) {
      throw new UnauthorizedException(
        'This link was sent to a different address than the one on the account now',
      );
    }

    const updated = await this.users.markSecondaryEmailVerified(record.userId);

    // Deliberately not the full user. This endpoint is public — the token is the only
    // credential — and a forwarded email or a proxy log should not be enough to read
    // back somebody's institutional address, role and validation state.
    return {
      secondaryEmail: updated.secondaryEmail!,
      message: 'That address is confirmed.',
    };
  }

  // --- Password changes -------------------------------------------------------

  /**
   * Change your own password. Also the exit from a temporary password handed out by
   * an admin, which is why the current one is required rather than assumed.
   *
   * Every existing session is revoked on success — if a temporary password did leak,
   * whoever else used it is signed out by the legitimate owner's change. A fresh pair
   * is then issued for the caller, so the device doing the change stays signed in
   * instead of being bounced to the login screen for doing the right thing.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: SessionContext = {},
  ): Promise<AuthResponseDto> {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user) throw new UnauthorizedException('Session expired');

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Your current password is not correct');
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'Choose a password you have not been using already',
      );
    }

    await this.users.setPassword(
      userId,
      await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    );

    // Order matters: revoke first, then mint. The other way round would kill the
    // token we just handed out.
    await this.logoutAll(userId);
    return this.buildAuthResponse(user, context);
  }

  /**
   * Keyed on the username, not the address: after a refused sign-in that is the only
   * thing the person has typed, and asking them for an address to receive a link
   * they cannot see is how this feature goes unused.
   */
  async resendVerification(username: string): Promise<{ message: string }> {
    const user = await this.users.findByUsernameWithPassword(username);

    // Always answer the same way so this cannot be used to probe for accounts.
    const message =
      'If that account exists and is still unverified, a new link is on its way.';

    if (!user || user.emailVerifiedAt) return { message };

    // Scoped to PRIMARY_EMAIL. Without the filter this also discarded any pending
    // link for the personal address, so asking for a new primary link silently broke
    // an unrelated confirmation the person was waiting on.
    await this.revokePendingPrimaryEmailTokens(user.id);
    await this.issueEmailVerificationToken(user);
    return { message };
  }

  /**
   * Invalidates any unclicked primary-address link for an account.
   *
   * Called when an admin changes somebody's main address: a link issued for the old
   * address must not stay spendable, because redeeming it marks the *new* address
   * verified and hands back a session.
   */
  async revokePendingPrimaryEmailTokens(userId: string): Promise<void> {
    await this.verificationTokens.delete({
      userId,
      purpose: VerificationPurpose.PRIMARY_EMAIL,
      consumedAt: IsNull(),
    });
  }

  // --- Login / sessions -------------------------------------------------------

  async login(
    dto: LoginDto,
    context: SessionContext = {},
  ): Promise<AuthResponseDto> {
    const user = await this.users.findByUsernameWithPassword(dto.username);

    // Compare against a dummy hash when the user is missing so that a wrong username
    // and a wrong password take the same amount of time.
    const hash =
      user?.passwordHash ??
      '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Incorrect username or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended');
    }
    // PENDING_PROFILE is deliberately allowed through: the whole point of that state
    // is that they can come back and finish. Everything but the profile screen is
    // closed to them by the guard, not by this check.
    if (user.status === UserStatus.PENDING_EMAIL_VERIFICATION) {
      throw new UnauthorizedException(
        'Please verify your email address before signing in',
      );
    }

    return this.buildAuthResponse(user, context);
  }

  async refresh(
    refreshToken: string,
    context: SessionContext = {},
  ): Promise<AuthTokensDto> {
    const record = await this.refreshTokens.findOne({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    const user = await this.users.findById(record.userId);
    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    // Rotate: the presented token is burned before a new one is handed out.
    record.revokedAt = new Date();
    await this.refreshTokens.save(record);

    return this.issueTokens(user, context);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Housekeeping: drop refresh tokens that expired more than 30 days ago. */
  async purgeExpiredTokens(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000);
    const result = await this.refreshTokens.delete({
      expiresAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  // --- Token plumbing ---------------------------------------------------------

  private async buildAuthResponse(
    user: User,
    context: SessionContext = {},
  ): Promise<AuthResponseDto> {
    const tokens = await this.issueTokens(user, context);
    const fresh = await this.users.findByIdOrFail(user.id);
    return { ...tokens, user: UserResponseDto.from(fresh) };
  }

  private async issueTokens(
    user: User,
    context: SessionContext,
  ): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessTtl = this.config.getOrThrow<string>('jwt.accessTtl');
    const accessTtlSeconds = Math.floor(parseDuration(accessTtl) / 1000);
    const refreshTtl = this.config.getOrThrow<string>('jwt.refreshTtl');

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: accessTtlSeconds,
    });

    const refreshToken = randomBytes(48).toString('hex');
    await this.refreshTokens.save(
      this.refreshTokens.create({
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + parseDuration(refreshTtl)),
        userAgent: context.userAgent?.slice(0, 255) ?? null,
        ipAddress: context.ipAddress?.slice(0, 64) ?? null,
      }),
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtlSeconds,
    };
  }

  private isProduction(): boolean {
    return this.config.get<string>('nodeEnv') === 'production';
  }
}

/** Turns "15m" / "30d" / "3600" into milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhdw]?)$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration: ${value}`);

  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return amount * multipliers[unit];
}
