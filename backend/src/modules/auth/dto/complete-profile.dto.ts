import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { SELF_SIGNUP_ROLES, UserRole } from '../../users/enums/user-role.enum';

/**
 * Step two: who they are and where to reach them.
 *
 * Both addresses are required here. The institutional one decides membership; the
 * recovery one is what keeps the account reachable once that mailbox is closed,
 * which for a medical student is a date they already know.
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

  @ApiProperty({
    example: 'ana.perez@gmail.com',
    description:
      'Recovery address. Must not be on a domain that belongs to an institution — ' +
      'a second institutional address disappears at the same time as the first.',
  })
  @IsEmail({}, { message: 'A valid recovery email address is required' })
  @MaxLength(320)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  secondaryEmail!: string;

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
