import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';
import { UserStatus } from '../../modules/users/enums/user-status.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOWS_PENDING_PROFILE_KEY } from '../decorators/allow-pending-profile.decorator';

/**
 * Holds a half-finished account to the screen that finishes it.
 *
 * The same shape as PasswordChangeGuard, and for the same reason: the frontend
 * routing is a convenience, the API is the control. Without this, an account with no
 * rank, no institution and no verified address could call anything the role default
 * happens to allow — and the role default is `medical_student`, a real rank that
 * nobody chose.
 *
 * Runs after JwtAuthGuard, so `request.user` is populated by the time it is reached.
 */
@Injectable()
export class ProfileCompletionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOWS_PENDING_PROFILE_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (user?.status === UserStatus.PENDING_PROFILE) {
      throw new ForbiddenException(
        'Finish setting up your profile before using the rest of the app',
      );
    }

    return true;
  }
}
