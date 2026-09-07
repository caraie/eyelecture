import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { SELF_SIGNUP_ROLES, UserRole } from '../../users/enums/user-role.enum';

/**
 * Step two: who they are and where to reach them.
 *
 * Only the institutional address is required — it decides membership, so nothing can
 * be resolved without it. The recovery one is offered here because this is the
 * moment somebody is thinking about it, but requiring it would block signing up on a
 * detail that can be filled in from the profile any time afterwards.
 */
export class CompleteProfileDto {
  @ApiProperty({
    enum: SELF_SIGNUP_ROLES,
    description: 'Their rank. Administrators are never created this way.',
  })
  @IsEnum(UserRole)
  @IsIn([...SELF_SIGNUP_ROLES], { message: 'Pick one of the listed ranks' })
  role!: UserRole;

  @ApiProperty({
    example: 'ana.perez@stanford.edu',
    description:
      'Institutional address for anyone still in training. An attending physician ' +
      'may use a personal one — nothing is auto-validated from it.',
  })
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiPropertyOptional({
    example: 'ana.perez@gmail.com',
    description:
      'Optional recovery address. Must not be on a domain that belongs to an ' +
      'institution — a second institutional address disappears at the same time as ' +
      'the first. It can be added later from the profile.',
  })
  @IsOptional()
  // An untouched optional input submits '', which means "left blank", not
  // "invalid". Rejecting it would fail a form nobody filled in.
  @Transform(({ value }) =>
    value === null || value === undefined || String(value).trim() === ''
      ? undefined
      : String(value).trim().toLowerCase(),
  )
  @IsEmail({}, { message: 'The recovery email address is not valid' })
  @MaxLength(320)
  secondaryEmail?: string;

  @ApiPropertyOptional({
    description:
      'The institution they say they belong to. Only used when the email domain ' +
      'does not already resolve to one — it puts them in that institution’s review ' +
      'queue instead of the global one.',
  })
  @IsOptional()
  @IsUUID()
  requestedInstitutionId?: string;
}
