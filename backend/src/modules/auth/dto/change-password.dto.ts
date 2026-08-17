import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Used both for a voluntary change and for the forced one after an admin hands out
 * a temporary password. The current password is required either way — knowing the
 * temporary one is what proves the person is the intended recipient.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'The password currently in use.' })
  @IsString()
  @MinLength(1, { message: 'Your current password is required' })
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    minLength: 8,
    description: 'At least 8 characters, including one number or symbol.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  // Same rule as signup — see RegisterDto for why length carries the weight.
  @Matches(/[^\p{L}]/u, {
    message: 'Password must contain at least one number or symbol',
  })
  newPassword!: string;
}
