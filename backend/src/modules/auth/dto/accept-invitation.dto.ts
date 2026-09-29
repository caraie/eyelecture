import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USERNAME_PATTERN, normalizeUsername } from './register.dto';

/**
 * Redeeming an invitation. It is a registration with three of the usual questions
 * already answered — the institution, the rank, and the institutional address all
 * come from the token, not from the form, because the whole point of the link is
 * that somebody already decided those.
 *
 * The personal address is still asked for. It is what keeps the account reachable
 * once an institutional mailbox is switched off, and an administrator's account is
 * the worst one to lose that way.
 */
export class AcceptInvitationDto {
  @ApiProperty({ description: 'The token from the invitation link.' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token!: string;

  @ApiProperty({ example: 'Sofía' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value).trim())
  firstName!: string;

  @ApiProperty({ example: 'Marchetti' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => String(value).trim())
  lastName!: string;

  @ApiProperty({ example: 'sofia.marchetti' })
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

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  @Matches(/[^\p{L}]/u, {
    message: 'Password must contain at least one number or symbol',
  })
  password!: string;

  @ApiProperty({ example: 'you@gmail.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(320)
  personalEmail!: string;
}
