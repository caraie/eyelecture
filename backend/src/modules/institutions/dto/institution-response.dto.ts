import { ApiProperty } from '@nestjs/swagger';
import { Institution } from '../entities/institution.entity';

export class InstitutionDomainResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() domain!: string;
}

export class InstitutionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) logoUrl!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [InstitutionDomainResponseDto] })
  domains!: InstitutionDomainResponseDto[];
  @ApiProperty() createdAt!: Date;

  static from(institution: Institution): InstitutionResponseDto {
    return {
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      description: institution.description,
      logoUrl: institution.logoUrl,
      isActive: institution.isActive,
      domains: (institution.domains ?? []).map((d) => ({
        id: d.id,
        domain: d.domain,
      })),
      createdAt: institution.createdAt,
    };
  }
}

/** What an unauthenticated visitor is allowed to see on the signup form. */
export class PublicInstitutionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true }) logoUrl!: string | null;

  static from(institution: Institution): PublicInstitutionDto {
    return {
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      logoUrl: institution.logoUrl,
    };
  }
}

/** Answer to "will this email address validate me automatically?". */
export class DomainLookupDto {
  @ApiProperty() matched!: boolean;
  @ApiProperty({ type: PublicInstitutionDto, nullable: true })
  institution!: PublicInstitutionDto | null;
}
