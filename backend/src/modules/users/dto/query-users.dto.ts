import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { ValidationStatus } from '../enums/validation-status.enum';

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or email, case-insensitive' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: ValidationStatus })
  @IsOptional()
  @IsEnum(ValidationStatus)
  validationStatus?: ValidationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}
