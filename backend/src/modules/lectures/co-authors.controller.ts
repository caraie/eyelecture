import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoAuthorsService } from './co-authors.service';
import {
  AddCoAuthorDto,
  CoAuthorDto,
  InviteCoAuthorDto,
  PersonDto,
  SearchPeopleDto,
} from './dto/co-author.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

const AUTHOR_ROLES = [
  UserRole.SUPER_USER,
  UserRole.PROGRAM_ADMINISTRATOR,
  UserRole.ATTENDING_PHYSICIAN,
  UserRole.FELLOW,
] as const;

/**
 * Who is credited on a lecture besides its author.
 *
 * Reading the list is not here: the author and co-authors are part of what a
 * lecture *is*, so they come back on the lecture itself for everybody who can
 * see it. These routes are the writing side, and are restricted accordingly.
 */
@ApiTags('lectures')
@ApiBearerAuth()
@Controller('lectures/:lectureId/co-authors')
@UseGuards(RolesGuard)
@Roles(...AUTHOR_ROLES)
export class CoAuthorsController {
  constructor(private readonly coAuthors: CoAuthorsService) {}

  @Get('search')
  @ApiOperation({ summary: 'People to credit, by name or address' })
  async search(
    @Query() query: SearchPeopleDto,
    @CurrentUser() user: User,
  ): Promise<PersonDto[]> {
    const people = await this.coAuthors.search(query.q, user);
    return people.map(PersonDto.from);
  }

  @Post()
  @ApiOperation({ summary: 'Credit somebody who already has an account' })
  async add(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Body() dto: AddCoAuthorDto,
    @CurrentUser() user: User,
  ): Promise<CoAuthorDto[]> {
    const rows = await this.coAuthors.add(lectureId, dto.userId, user);
    return rows.map(CoAuthorDto.from);
  }

  @Post('invitations')
  @ApiOperation({
    summary: 'Write to somebody who is not on the platform yet',
    description:
      'An address that already belongs to an account is credited outright ' +
      'instead, and no mail is sent.',
  })
  async invite(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Body() dto: InviteCoAuthorDto,
    @CurrentUser() user: User,
  ): Promise<CoAuthorDto[]> {
    const { coAuthors } = await this.coAuthors.invite(
      lectureId,
      dto.email,
      dto.name ?? null,
      user,
    );
    return coAuthors.map(CoAuthorDto.from);
  }

  @Post(':coAuthorId/invitations')
  @ApiOperation({ summary: 'Send it again, with a fresh link' })
  async resend(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Param('coAuthorId', ParseUUIDPipe) coAuthorId: string,
    @CurrentUser() user: User,
  ): Promise<CoAuthorDto[]> {
    const { coAuthors } = await this.coAuthors.resend(
      lectureId,
      coAuthorId,
      user,
    );
    return coAuthors.map(CoAuthorDto.from);
  }

  @Delete(':coAuthorId')
  @ApiOperation({ summary: 'Take somebody off, or withdraw an invitation' })
  async remove(
    @Param('lectureId', ParseUUIDPipe) lectureId: string,
    @Param('coAuthorId', ParseUUIDPipe) coAuthorId: string,
    @CurrentUser() user: User,
  ): Promise<CoAuthorDto[]> {
    const rows = await this.coAuthors.remove(lectureId, coAuthorId, user);
    return rows.map(CoAuthorDto.from);
  }
}
