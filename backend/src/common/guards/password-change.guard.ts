import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOWS_PENDING_PASSWORD_KEY } from '../decorators/allow-password-change.decorator';

/**
 * Holds an account with an admin-issued temporary password to a dead end: it can read
 * itself, change its password, and sign out. Nothing else.
 *
 * The frontend already routes these users to the change-password screen, but that is a
 * convenience, not a control — the API is what has to hold. Otherwise a temporary
 * password that leaked in a chat message is a working admin credential for anyone who
 * skips the UI, which is exactly what forcing the change is meant to prevent.
 *
 * Runs after JwtAuthGuard, so `request.user` is populated by the time it is reached.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOWS_PENDING_PASSWORD_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (user?.mustChangePassword) {
      throw new ForbiddenException(
        'Set a new password before using the rest of the app',
      );
    }

    return true;
  }
}
