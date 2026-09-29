import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { SELF_SIGNUP_ROLES, UserRole } from '../../users/enums/user-role.enum';

/** '' from an untouched optional input means "left blank", not "invalid". */
const blankToUndefined = ({ value }: { value: unknown }): string | undefined =>
  value === null || value === undefined || String(value).trim() === ''
    ? undefined
    : String(value).trim().toLowerCase();

/**
 * Step two: who they are, where to reach them, and how far along they are.
 *
 * The personal address is the required one. It is the only address that survives
 * graduating, so it is what the account is anchored to. The institutional address is
 * required of everybody whose rank implies an institution — see PROFILE_FIELDS —
 * and is what a known domain matches against.
 *
 * Which of the remaining fields are required, optional or refused is decided by the
 * rank, in PROFILE_FIELDS. Marking them all optional here and enforcing the rule in
 * the service keeps one table in charge rather than two.
 */
export class CompleteProfileDto {
  @ApiProperty({
    enum: SELF_SIGNUP_ROLES,
    description: 'Their user type. Super users are never created this way.',
  })
  @IsEnum(UserRole)
  @IsIn([...SELF_SIGNUP_ROLES], { message: 'Pick one of the listed user types' })
  role!: UserRole;

  @ApiProperty({
    example: 'ana.perez@gmail.com',
    description:
      'Personal address, outside any institution. Required: it is what keeps the ' +
      'account reachable once an institutional mailbox is switched off.',
  })
  @IsEmail({}, { message: 'A valid personal email address is required' })
  @MaxLength(320)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  personalEmail!: string;

  @ApiPropertyOptional({
    example: 'ana.perez@stanford.edu',
    description:
      'Institutional address. Required for every rank that implies an institution; ' +
      'an attending physician may leave it out and hold an unaffiliated account.',
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsEmail({}, { message: 'The institutional email address is not valid' })
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    description:
      'The institution they say they belong to. Only used when the email domain ' +
      'does not already resolve to one — it puts them in that institution’s review ' +
      'queue instead of the global one.',
  })
  @IsOptional()
  @IsUUID()
  requestedInstitutionId?: string;

  @ApiPropertyOptional({
    description: 'PGY level. Required of residents, refused for everyone else.',
  })
  @IsOptional()
  @IsUUID()
  trainingLevelId?: string;

  @ApiPropertyOptional({
    description:
      'Clinical focus. Required of fellows, attending physicians and program ' +
      'administrators; refused for anyone else. "Non-clinical" is on the list.',
  })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({
    description: 'Where they did their residency. Optional, and only for ranks far enough along to have one.',
  })
  @IsOptional()
  @IsUUID()
  residencyProgramId?: string;

  @ApiPropertyOptional({
    description:
      'Where they did their fellowship. Optional in every sense — not everybody did one.',
  })
  @IsOptional()
  @IsUUID()
  fellowshipProgramId?: string;
}
