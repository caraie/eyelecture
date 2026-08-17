import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

/** What a user may change about themselves. */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
}

/** Add or replace the personal address on your own account. */
export class SetSecondaryEmailDto {
  @ApiProperty({ example: 'ana.perez@gmail.com' })
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'The personal email address is not valid' })
  @MaxLength(320)
  secondaryEmail!: string;
}

// --- Admin management ---------------------------------------------------------

/**
 * Creating an administrator. There is no self-serve path to this role by design, so
 * the account is made complete: active, email already marked confirmed, membership
 * validated. The one loose end is the password, which the creator sets to something
 * temporary and the new admin is forced to replace on first sign-in.
 */
export class CreateAdminDto {
  @ApiProperty({ example: 'nuevo.admin@eyelecture.com' })
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Carla' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value ?? '').trim())
  firstName!: string;

  @ApiProperty({ example: 'Rodríguez' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value ?? '').trim())
  lastName!: string;

  @ApiProperty({
    minLength: 8,
    description:
      'Temporary password. Hand it over out of band; the new admin must replace it ' +
      'before they can use the app.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  @Matches(/[^\p{L}]/u, {
    message: 'Password must contain at least one number or symbol',
  })
  temporaryPassword!: string;

  @ApiPropertyOptional({
    description: 'Optional personal address. Also signs them in.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || String(value).trim() === ''
      ? undefined
      : String(value).trim().toLowerCase(),
  )
  @IsEmail({}, { message: 'The personal email address is not valid' })
  @MaxLength(320)
  secondaryEmail?: string;
}

/** Editing another account as an administrator. */
export class AdminUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value ?? '').trim())
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value ?? '').trim())
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'Changing this moves the account to a new institution domain, so membership is ' +
      're-evaluated against it.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    description: 'Pass an empty string to remove the personal address.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || String(value).trim() === ''
      ? null
      : String(value).trim().toLowerCase(),
  )
  @IsEmail({}, { message: 'The personal email address is not valid' })
  @MaxLength(320)
  secondaryEmail?: string | null;
}

/** Hand an account a new temporary password. */
export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  @Matches(/[^\p{L}]/u, {
    message: 'Password must contain at least one number or symbol',
  })
  temporaryPassword!: string;
}

/** Admin-only changes. */
export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class AssignInstitutionDto {
  @ApiPropertyOptional({ description: 'Pass null to detach the user.' })
  @IsOptional()
  @IsUUID()
  institutionId?: string | null;
}
