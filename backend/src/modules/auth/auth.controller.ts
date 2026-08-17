import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService, SessionContext } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetSecondaryEmailDto } from '../users/dto/update-user.dto';
import {
  AuthResponseDto,
  AuthTokensDto,
  RefreshTokenDto,
  RegisterResponseDto,
  VerifyEmailDto,
} from './dto/token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AllowPendingPasswordChange } from '../../common/decorators/allow-password-change.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UserResponseDto } from '../users/dto/user-response.dto';

const sessionContextFrom = (req: Request): SessionContext => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account',
    description:
      'If the email domain belongs to a known institution the user is validated ' +
      'automatically; otherwise the account lands in a review queue.',
  })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.auth.login(dto, sessionContextFrom(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken, sessionContextFrom(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an email address',
    description: 'Returns a session, so the user lands signed in.',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponseDto> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @Body() dto: { email: string },
  ): Promise<{ message: string }> {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Post('verify-secondary-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the personal address',
    description:
      'Public because the link may be opened in a browser with no session — the token ' +
      'itself identifies the account. Returns no session and no account details, so a ' +
      'forwarded link is neither a way in nor a way to read the account.',
  })
  verifySecondaryEmail(
    @Body() dto: VerifyEmailDto,
  ): Promise<{ secondaryEmail: string; message: string }> {
    return this.auth.verifySecondaryEmail(dto.token);
  }

  @Post('secondary-email')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add or replace your personal address',
    description:
      'Sends a confirmation link. The address works for sign-in right away.',
  })
  setSecondaryEmail(
    @CurrentUser() user: User,
    @Body() dto: SetSecondaryEmailDto,
  ): Promise<{ user: UserResponseDto; devToken?: string }> {
    return this.auth.setSecondaryEmail(user.id, dto.secondaryEmail);
  }

  @Post('secondary-email/resend')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  resendSecondaryEmailVerification(
    @CurrentUser() user: User,
  ): Promise<{ message: string; devToken?: string }> {
    return this.auth.resendSecondaryEmailVerification(user.id);
  }

  @Delete('secondary-email')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove your personal address' })
  removeSecondaryEmail(@CurrentUser() user: User): Promise<UserResponseDto> {
    return this.auth.removeSecondaryEmail(user.id);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change your own password',
    description:
      'Also the way out of a temporary password set by an admin. Revokes every other ' +
      'session and returns a fresh pair for this one.',
  })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      sessionContextFrom(req),
    );
  }

  // Signing out has to work in every state, including a pending password change.
  @Post('logout')
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async logoutAll(@CurrentUser() user: User): Promise<void> {
    await this.auth.logoutAll(user.id);
  }

  // Reachable on a temporary password: the client needs it to discover that a
  // password change is pending in the first place.
  @Get('me')
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'The authenticated user' })
  me(@CurrentUser() user: User): UserResponseDto {
    return UserResponseDto.from(user);
  }
}
