import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';

export class RegisterDto {
  @ApiProperty({ example: 'ana.perez@stanford.edu' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiPropertyOptional({
    example: 'ana.perez@gmail.com',
    description:
      'Optional personal address. Signs the user in just like the main one, so the ' +
      'account survives losing the institutional mailbox. Must not be on a domain ' +
      'that belongs to a known institution — that is what the main address is for.',
  })
  @IsOptional()
  // Empty string means "left blank", not "invalid". Browsers submit '' for an
  // untouched optional input, and rejecting that would fail a form nobody filled in.
  @Transform(({ value }) =>
    value === null || value === undefined || String(value).trim() === ''
      ? undefined
      : String(value).trim().toLowerCase(),
  )
  @IsEmail({}, { message: 'The personal email address is not valid' })
  @MaxLength(320)
  secondaryEmail?: string;

  @ApiProperty({
    minLength: 8,
    description: 'At least 8 characters, including one number or symbol.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  // One non-letter is enough. Character-class rules past that push people toward
  // predictable substitutions ("Password1!") rather than better passwords, so
  // length is what carries the weight here.
  //
  // \p{L} rather than A-Za-z: without it "contraseña" would satisfy the rule,
  // because the ñ is not an ASCII letter — and that is not what the hint promises.
  @Matches(/[^\p{L}]/u, {
    message: 'Password must contain at least one number or symbol',
  })
  password!: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value).trim())
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value).trim())
  lastName!: string;

  @ApiPropertyOptional({
    enum: [UserRole.STUDENT, UserRole.PROGRAM_DIRECTOR],
    default: UserRole.STUDENT,
    description: 'Admins are never created through this endpoint.',
  })
  @IsOptional()
  @IsEnum(UserRole)
  @IsIn([UserRole.STUDENT, UserRole.PROGRAM_DIRECTOR], {
    message: 'You can only sign up as a student or a program director',
  })
  role?: UserRole;

  @ApiPropertyOptional({
    description:
      'The institution the person says they belong to. Only used when their email ' +
      'domain does not already resolve to one — it puts them in that institution’s ' +
      'review queue instead of the global one.',
  })
  @IsOptional()
  @IsUUID()
  requestedInstitutionId?: string;
}
