import {
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
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../users/enums/validation-status.enum';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  AuthTokensDto,
  RegisterResponseDto,
} from './dto/token.dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
  ) {}

  // --- Registration -----------------------------------------------------------

  /**
   * Creates the account and decides, in one place, whether it needs human review.
   *
   * The rule:
   *   - the email domain resolves to an active institution  -> auto-validated
   *   - it does not, and the role is STUDENT                -> pending, a program
   *     director of the requested institution reviews it
   *   - the role is PROGRAM_DIRECTOR                        -> always pending, an
   *     admin reviews it (a director validates others, so nobody self-appoints)
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (await this.users.emailExists(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const role = dto.role ?? UserRole.STUDENT;
    const domain = emailDomainOf(dto.email);
    const matched = await this.institutions.findByEmailDomain(domain);

    const autoValidated = matched !== null && role === UserRole.STUDENT;

    const user = await this.users.create({
      email: dto.email,
      emailDomain: domain,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
      status: UserStatus.PENDING_EMAIL_VERIFICATION,
      institutionId: matched?.id ?? null,
      requestedInstitutionId: matched ? null : (dto.requestedInstitutionId ?? null),
      validationStatus: autoValidated
        ? ValidationStatus.VALIDATED
        : ValidationStatus.PENDING,
      validationMethod: autoValidated ? ValidationMethod.EMAIL_DOMAIN : null,
      validatedAt: autoValidated ? new Date() : null,
    });

    const verificationToken = await this.issueEmailVerificationToken(user);

    return {
      user: UserResponseDto.from(user),
      autoValidated,
      message: this.registrationMessage(user, matched?.name ?? null, autoValidated),
      ...(this.isProduction() ? {} : { devEmailVerificationToken: verificationToken }),
    };
  }

  private registrationMessage(
    user: User,
    institutionName: string | null,
    autoValidated: boolean,
  ): string {
    if (autoValidated && institutionName) {
      return `Your address is registered to ${institutionName}, so your membership is already confirmed. Verify your email to finish signing up.`;
    }
    if (user.role === UserRole.PROGRAM_DIRECTOR) {
      return 'Verify your email to finish signing up. An administrator will review your program director request.';
    }
    return 'Verify your email to finish signing up. Because your address is not on a known institution domain, a program director needs to confirm your membership.';
  }

  // --- Email verification -----------------------------------------------------

  private async issueEmailVerificationToken(user: User): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const ttlHours = this.config.getOrThrow<number>(
      'app.emailVerificationTtlHours',
    );

    await this.verificationTokens.save(
      this.verificationTokens.create({
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      }),
    );

    const link = `${this.config.getOrThrow<string>('app.frontendUrl')}/auth/verify-email?token=${token}`;
    // No mail transport wired up yet — the link goes to the log so the flow is
    // testable end to end. Swap this for your provider when you add one.
    this.logger.log(`Email verification link for ${user.email}: ${link}`);

    return token;
  }

  async verifyEmail(token: string): Promise<AuthResponseDto> {
    const record = await this.verificationTokens.findOne({
      where: { tokenHash: hashToken(token) },
    });

    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'This verification link is invalid or has expired',
      );
    }

    record.consumedAt = new Date();
    await this.verificationTokens.save(record);

    const user = await this.users.markEmailVerified(record.userId);
    return this.buildAuthResponse(user);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    // Always answer the same way so this cannot be used to probe for addresses.
    const message =
      'If that address belongs to an unverified account, a new link is on its way.';

    if (!user || user.emailVerifiedAt) return { message };

    await this.verificationTokens.delete({ userId: user.id, consumedAt: IsNull() });
    await this.issueEmailVerificationToken(user);
    return { message };
  }

  // --- Login / sessions -------------------------------------------------------

  async login(dto: LoginDto, context: SessionContext = {}): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    // Compare against a dummy hash when the user is missing so that a wrong email
    // and a wrong password take the same amount of time.
    const hash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended');
    }
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
    const result = await this.refreshTokens.delete({ expiresAt: LessThan(cutoff) });
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
      email: user.email,
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
