import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Accepts "@stanford.edu", "Stanford.EDU" or "stanford.edu" — stores "stanford.edu". */
export const normalizeDomain = (value: string): string =>
  value.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/;

export class CreateInstitutionDto {
  @ApiProperty({ example: 'Stanford University School of Medicine' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'stanford-medicine',
    description: 'Lowercase, hyphen-separated. Derived from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({
    example: ['stanford.edu', 'med.stanford.edu'],
    description:
      'Email domains owned by this institution. Anyone registering with an address ' +
      'on one of these is validated automatically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v: string) => normalizeDomain(String(v))) : value,
  )
  @Matches(DOMAIN_PATTERN, {
    each: true,
    message: 'each domain must be a valid hostname, e.g. stanford.edu',
  })
  domains?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
