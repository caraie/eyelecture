import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ValidateUserDto {
  @ApiPropertyOptional({
    description:
      'Institution to attach the person to. Optional for a program director — ' +
      'their own institution is used. Required for an admin validating an ' +
      'unaffiliated signup.',
  })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ description: 'Internal note, shown back to the user.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectUserDto {
  @ApiPropertyOptional({ description: 'Reason shown to the user.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
