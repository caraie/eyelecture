import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../enums/validation-status.enum';

export class UserInstitutionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
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
  secondaryEmail!: string | null;
  @ApiProperty({
    description:
      'False is a normal state. Confirming it only proves the mailbox is readable.',
  })
  secondaryEmailVerified!: boolean;
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
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({
    description:
      'True while a temporary password set by an admin is still in place. The client ' +
      'should route the user to the change-password screen.',
  })
  mustChangePassword!: boolean;
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

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      secondaryEmail: user.secondaryEmail,
      secondaryEmailVerified: user.secondaryEmailVerifiedAt !== null,
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
      emailVerified: user.emailVerifiedAt !== null,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  }
}
