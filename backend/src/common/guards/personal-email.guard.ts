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
import { ALLOWS_MISSING_PERSONAL_EMAIL_KEY } from '../decorators/allow-missing-personal-email.decorator';

/**
 * Holds an account with no personal address to the screen that adds one.
 *
 * Every account created from now on has one — the signup form requires it. This is
 * for the accounts that predate that rule: rather than inventing an address for them
 * or leaving them in a state where a lost institutional mailbox loses the account,
 * they are asked once, on their next visit.
 *
 * Fourth in the chain, after the profile-completion guard, because somebody who has
 * not finished signing up has no personal address *yet* and should be sent to the
 * signup form rather than here — `needsPersonalEmail` encodes that by requiring a
 * complete profile.
 */
@Injectable()
export class PersonalEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOWS_MISSING_PERSONAL_EMAIL_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (user?.needsPersonalEmail) {
      throw new ForbiddenException(
        'Add a personal email address before using the rest of the app',
      );
    }

    return true;
  }
}
