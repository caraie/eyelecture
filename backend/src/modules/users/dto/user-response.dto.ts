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
  @ApiProperty() email!: string;
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
  @ApiProperty() createdAt!: Date;

  static from(user: User): UserResponseDto {
    const toInstitution = (value: {
      id: string;
      name: string;
      slug: string;
    } | null | undefined): UserInstitutionDto | null =>
      value ? { id: value.id, name: value.name, slug: value.slug } : null;

    return {
      id: user.id,
      email: user.email,
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
      createdAt: user.createdAt,
    };
  }
}
