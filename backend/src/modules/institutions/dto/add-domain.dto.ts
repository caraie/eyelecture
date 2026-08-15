import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { normalizeDomain } from './create-institution.dto';

export class AddDomainDto {
  @ApiProperty({ example: '@stanford.edu' })
  @IsString()
  @Transform(({ value }) => normalizeDomain(String(value)))
  @Matches(/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/, {
    message: 'domain must be a valid hostname, e.g. stanford.edu',
  })
  domain!: string;
}
