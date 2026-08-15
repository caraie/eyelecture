import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'The token from the verification link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ description: 'Access token lifetime in seconds.' })
  expiresIn!: number;
}

export class AuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
}

export class RegisterResponseDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;

  @ApiProperty({
    description:
      'True when the signup email matched a known institution domain, so no human ' +
      'review is needed.',
  })
  autoValidated!: boolean;

  @ApiProperty({ description: 'Human-readable next step for the UI to show.' })
  message!: string;

  @ApiProperty({
    required: false,
    description:
      'Only present outside production: the email verification token, so you can ' +
      'finish the flow without a mail server.',
  })
  devEmailVerificationToken?: string;
}
