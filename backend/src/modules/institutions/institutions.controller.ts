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
import { ConfigService } from '@nestjs/config';
import { InstitutionsService } from './institutions.service';
import { InstitutionInvitationsService } from './institution-invitations.service';
import {
  InvitationResponseDto,
  InviteAdministratorDto,
} from './dto/invitation.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { AddDomainDto } from './dto/add-domain.dto';
import {
  DomainLookupDto,
  InstitutionResponseDto,
  PublicInstitutionDto,
} from './dto/institution-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('institutions')
@Controller('institutions')
@UseGuards(RolesGuard)
export class InstitutionsController {
  constructor(
    private readonly institutions: InstitutionsService,
    private readonly invitations: InstitutionInvitationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Open endpoint backing the institution picker on the signup form. Deliberately
   * exposes no domains — knowing which addresses auto-validate is not public info.
   */
  @Public()
  @Get('public')
  @ApiOperation({ summary: 'List active institutions for the signup form' })
  async findPublic(): Promise<PublicInstitutionDto[]> {
    const institutions = await this.institutions.findAll({ activeOnly: true });
    return institutions.map(PublicInstitutionDto.from);
  }

  /**
   * Tells the signup form, while the visitor is still typing, whether their
   * address will validate them automatically.
   *
   * This does reveal whether a given domain is registered — but so does pressing
   * "create account", and knowing beforehand is what stops a student from picking
   * the wrong institution from the list and landing in a queue for no reason.
   */
  @Public()
  @Get('lookup')
  @ApiOperation({ summary: 'Resolve an email domain to an institution' })
  async lookup(
    @Query('email') email?: string,
    @Query('domain') domain?: string,
  ): Promise<DomainLookupDto> {
    const candidate = (email ?? domain ?? '').trim().toLowerCase();
    const value = candidate.includes('@')
      ? candidate.slice(candidate.lastIndexOf('@') + 1)
      : candidate;

    if (!value) return { matched: false, institution: null };

    const institution = await this.institutions.findByEmailDomain(value);
    return {
      matched: institution !== null,
      institution: institution ? PublicInstitutionDto.from(institution) : null,
    };
  }

  @Get()
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List every institution with its email domains' })
  async findAll(): Promise<InstitutionResponseDto[]> {
    const institutions = await this.institutions.findAll();
    return institutions.map(InstitutionResponseDto.from);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.findOne(id));
  }

  @Post()
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an institution and optionally its email domains' })
  async create(@Body() dto: CreateInstitutionDto): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.create(dto));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstitutionDto,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.update(id, dto));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.institutions.remove(id);
  }

  // --- Invitations --------------------------------------------------------------
  //
  // How the *first* program administrator at an institution gets in. Everybody after
  // them is approved locally by that first one, so these routes are rare by design
  // and belong to platform staff alone.

  @Get(':id/invitations')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Everyone this institution has been asked to hand over to' })
  async findInvitations(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvitationResponseDto[]> {
    const invitations = await this.invitations.findFor(id);
    return invitations.map(InvitationResponseDto.from);
  }

  @Post(':id/invitations')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Invite a program administrator',
    description:
      'Sends a single-use link. The account does not exist until the link is used, ' +
      'and when it is, it arrives already validated into this institution.',
  })
  async invite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: InviteAdministratorDto,
  ): Promise<InvitationResponseDto & { devLink?: string }> {
    const { invitation, link } = await this.invitations.invite(
      id,
      dto.email,
      admin.id,
    );

    // Handed back only when nothing was actually sent. With mail on, the link exists
    // in exactly one place — the recipient's inbox — and putting it on the inviter's
    // screen as well would make it two.
    const mailEnabled = this.config.get<boolean>('mail.enabled') ?? false;

    return {
      ...InvitationResponseDto.from(invitation),
      ...(mailEnabled ? {} : { devLink: link }),
    };
  }

  @Delete(':id/invitations/:invitationId')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw an invitation that has not been taken up' })
  async revokeInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationResponseDto> {
    return InvitationResponseDto.from(
      await this.invitations.revoke(id, invitationId),
    );
  }

  @Post(':id/domains')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach an email domain, e.g. @stanford.edu' })
  async addDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDomainDto,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(
      await this.institutions.addDomain(id, dto.domain),
    );
  }

  @Delete(':id/domains/:domainId')
  @Roles(UserRole.SUPER_USER)
  @ApiBearerAuth()
  async removeDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(
      await this.institutions.removeDomain(id, domainId),
    );
  }
}
