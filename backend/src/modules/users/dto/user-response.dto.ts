import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../entities/user.entity';
import { UserAffiliation } from '../entities/user-affiliation.entity';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../enums/validation-status.enum';

/** Enough of a reference-list entry to show it, without its timestamps. */
export class CatalogRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class UserInstitutionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

/**
 * One institution somebody has belonged to. Shown on the profile as "where you are"
 * and "where you have been" — the only difference between the two is `endedAt`.
 */
export class AffiliationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: UserInstitutionDto }) institution!: UserInstitutionDto;
  @ApiProperty({ nullable: true }) institutionalEmail!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ nullable: true }) endedAt!: Date | null;
  @ApiProperty() isCurrent!: boolean;

  static from(affiliation: UserAffiliation): AffiliationDto {
    return {
      id: affiliation.id,
      institution: {
        id: affiliation.institution.id,
        name: affiliation.institution.name,
        slug: affiliation.institution.slug,
      },
      institutionalEmail: affiliation.institutionalEmail,
      emailVerified: affiliation.emailVerifiedAt !== null,
      startedAt: affiliation.startedAt,
      endedAt: affiliation.endedAt,
      isCurrent: affiliation.endedAt === null,
    };
  }
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'What this person signs in with.' })
  username!: string;
  @ApiProperty({
    nullable: true,
    description: 'Institutional address. Null until the profile is completed.',
  })
  email!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional personal address, used to reach them, not to sign in.',
  })
  personalEmail!: string | null;
  @ApiProperty({
    description:
      'False is a normal state. Confirming it only proves the mailbox is readable.',
  })
  personalEmailVerified!: boolean;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ enum: ValidationStatus }) validationStatus!: ValidationStatus;
  @ApiPropertyOptional({ enum: ValidationMethod, nullable: true })
  validationMethod!: ValidationMethod | null;
  @ApiProperty({ nullable: true }) validatedAt!: Date | null;
  @ApiProperty({ nullable: true }) validationNote!: string | null;
  @ApiProperty({ type: UserInstitutionDto, nullable: true })
  institution!: UserInstitutionDto | null;
  @ApiProperty({ type: UserInstitutionDto, nullable: true })
  requestedInstitution!: UserInstitutionDto | null;
  @ApiProperty({ type: CatalogRefDto, nullable: true })
  trainingLevel!: CatalogRefDto | null;
  @ApiProperty({ type: CatalogRefDto, nullable: true })
  specialty!: CatalogRefDto | null;
  @ApiProperty({ type: CatalogRefDto, nullable: true })
  residencyProgram!: CatalogRefDto | null;
  @ApiProperty({ type: CatalogRefDto, nullable: true })
  fellowshipProgram!: CatalogRefDto | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({
    description:
      'True while a temporary password set by an admin is still in place. The client ' +
      'should route the user to the change-password screen.',
  })
  mustChangePassword!: boolean;
  @ApiProperty({
    description:
      'True for an account made before a personal address was required. The client ' +
      'should route the user to the screen that adds one.',
  })
  needsPersonalEmail!: boolean;
  @ApiProperty() createdAt!: Date;

  static from(user: User): UserResponseDto {
    const toInstitution = (
      value:
        | {
            id: string;
            name: string;
            slug: string;
          }
        | null
        | undefined,
    ): UserInstitutionDto | null =>
      value ? { id: value.id, name: value.name, slug: value.slug } : null;

    const catalogRef = (
      value: { id: string; name: string } | null | undefined,
    ): CatalogRefDto | null => (value ? { id: value.id, name: value.name } : null);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      personalEmail: user.personalEmail,
      personalEmailVerified: user.personalEmailVerifiedAt !== null,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
      status: user.status,
      validationStatus: user.validationStatus,
      validationMethod: user.validationMethod,
      validatedAt: user.validatedAt,
      validationNote: user.validationNote,
      institution: toInstitution(user.institution),
      requestedInstitution: toInstitution(user.requestedInstitution),
      trainingLevel: catalogRef(user.trainingLevel),
      specialty: catalogRef(user.specialty),
      residencyProgram: catalogRef(user.residencyProgram),
      fellowshipProgram: catalogRef(user.fellowshipProgram),
      emailVerified: user.emailVerifiedAt !== null,
      mustChangePassword: user.mustChangePassword,
      needsPersonalEmail: user.needsPersonalEmail,
      createdAt: user.createdAt,
    };
  }
}
