import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserResponseDto } from './dto/user-response.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { RejectUserDto, ValidateUserDto } from './dto/validate-user.dto';
import {
  AdminUpdateUserDto,
  AssignInstitutionDto,
  CreateAdminDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowPendingPasswordChange } from '../../common/decorators/allow-password-change.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginatedResult } from '../../common/dto/pagination.dto';

const toPage = (
  result: PaginatedResult<User>,
): PaginatedResult<UserResponseDto> => ({
  ...result,
  items: result.items.map(UserResponseDto.from),
});

/** Same cost factor as AuthService. Kept in step deliberately. */
const BCRYPT_ROUNDS = 12;

const hashPassword = async (password: string): Promise<string> =>
  await bcrypt.hash(password, BCRYPT_ROUNDS);

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @AllowPendingPasswordChange()
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
  async pendingCount(
    @CurrentUser() reviewer: User,
  ): Promise<{ count: number }> {
    return { count: await this.users.countPendingValidation(reviewer) };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return toPage(await this.users.findAll(query));
  }

  // --- Administrator management -----------------------------------------------
  //
  // Declared before the `:id` routes. Nest matches in declaration order, and
  // `admins` would otherwise be swallowed by `:id` and fail as an invalid UUID.

  @Get('admins')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Every administrator' })
  async findAdmins(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    // Mutated rather than spread into a new object: `skip` is a getter on the DTO
    // class, and spreading would leave it behind as an undefined property.
    query.role = UserRole.ADMIN;
    return toPage(await this.users.findAll(query));
  }

  @Post('admins')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create another administrator',
    description:
      'The account is created active and validated — an admin deciding to grant this ' +
      'is the approval. The temporary password must be replaced at first sign-in.',
  })
  async createAdmin(
    @CurrentUser() admin: User,
    @Body() dto: CreateAdminDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(
      await this.users.createAdmin(
        {
          email: dto.email,
          passwordHash: await hashPassword(dto.temporaryPassword),
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(dto.secondaryEmail ? { secondaryEmail: dto.secondaryEmail } : {}),
        },
        admin.id,
      ),
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit an account as an administrator' })
  async adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(
      await this.users.adminUpdate(id, dto, admin.id),
    );
  }

  @Post(':id/reset-password')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Hand an account a new temporary password',
    description: 'The user is forced to replace it the next time they sign in.',
  })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: ResetPasswordDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(
      await this.users.setTemporaryPassword(
        id,
        await hashPassword(dto.temporaryPassword),
        admin.id,
      ),
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an account',
    description:
      'Refuses to delete your own account — there is no undo and no way back in from ' +
      'the app. Sessions and pending verification links go with it; people this user ' +
      'validated keep their validation and lose only the attribution.',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    await this.users.remove(id, admin.id);
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
    return UserResponseDto.from(
      await this.users.setRole(id, dto.role, admin.id),
    );
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
