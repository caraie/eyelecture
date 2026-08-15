import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserResponseDto } from './dto/user-response.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { RejectUserDto, ValidateUserDto } from './dto/validate-user.dto';
import {
  AssignInstitutionDto,
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginatedResult } from '../../common/dto/pagination.dto';

const toPage = (
  result: PaginatedResult<User>,
): PaginatedResult<UserResponseDto> => ({
  ...result,
  items: result.items.map(UserResponseDto.from),
});

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user' })
  me(@CurrentUser() user: User): UserResponseDto {
    return UserResponseDto.from(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.updateProfile(user.id, dto));
  }

  @Get('pending-validation')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_DIRECTOR)
  @ApiOperation({
    summary: 'People waiting to be vouched for',
    description:
      'Program directors see students tied to their own institution. Admins see ' +
      'every pending request, including signups with no institution.',
  })
  async pending(
    @CurrentUser() reviewer: User,
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return toPage(await this.users.findPendingValidation(reviewer, query));
  }

  @Get('pending-validation/count')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_DIRECTOR)
  async pendingCount(@CurrentUser() reviewer: User): Promise<{ count: number }> {
    return { count: await this.users.countPendingValidation(reviewer) };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return toPage(await this.users.findAll(query));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_DIRECTOR)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.findByIdOrFail(id));
  }

  @Post(':id/validate')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_DIRECTOR)
  @ApiOperation({ summary: 'Approve a membership request' })
  async validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() reviewer: User,
    @Body() dto: ValidateUserDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.validate(id, reviewer, dto));
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_DIRECTOR)
  @ApiOperation({ summary: 'Turn down a membership request' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() reviewer: User,
    @Body() dto: RejectUserDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.reject(id, reviewer, dto));
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  async setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.setRole(id, dto.role, admin.id));
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(
      await this.users.setStatus(id, dto.status, admin.id),
    );
  }

  @Patch(':id/institution')
  @Roles(UserRole.ADMIN)
  async assignInstitution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignInstitutionDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(
      await this.users.assignInstitution(id, dto.institutionId ?? null),
    );
  }
}
