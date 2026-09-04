import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Letters, digits, dot, underscore and hyphen; must start and end with a letter or
 * digit. The edge characters are the point: a username ending in "." is impossible
 * to read aloud, and one starting with "-" gets mistaken for a flag by every
 * command-line tool it ever passes through.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/** Trimmed, but not lowercased — people keep the capitals they typed. */
export const normalizeUsername = (value: string): string => value.trim();

/**
 * Step one, and deliberately the whole of it: a name, a username and a password.
 *
 * No email here. Asking for one up front is what makes signing up feel like
 * paperwork, and everything the address is needed for — verification, membership,
 * reaching someone — happens after the account exists.
 */
export class RegisterDto {
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

  @ApiProperty({
    example: 'ana.perez',
    minLength: 3,
    maxLength: 30,
    description: 'What they will sign in with. Case-insensitively unique.',
  })
  @IsString()
  @Transform(({ value }) => normalizeUsername(String(value ?? '')))
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30)
  @Matches(USERNAME_PATTERN, {
    message:
      'Username can use letters, numbers, dots, underscores and hyphens, and must ' +
      'start and end with a letter or number',
  })
  username!: string;

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
}
