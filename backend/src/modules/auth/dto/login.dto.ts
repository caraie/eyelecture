import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeUsername } from './register.dto';

export class LoginDto {
  @ApiProperty({
    example: 'ana.perez',
    description:
      'The username. Email addresses do not sign anyone in — the institutional one ' +
      'can change, and the recovery one exists precisely for when the other is gone.',
  })
  @IsString()
  @Transform(({ value }) => normalizeUsername(String(value ?? '')))
  @MinLength(1)
  @MaxLength(30)
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
