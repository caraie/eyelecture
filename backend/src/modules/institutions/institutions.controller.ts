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
import { InstitutionsService } from './institutions.service';
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
  constructor(private readonly institutions: InstitutionsService) {}

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
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List every institution with its email domains' })
  async findAll(): Promise<InstitutionResponseDto[]> {
    const institutions = await this.institutions.findAll();
    return institutions.map(InstitutionResponseDto.from);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.findOne(id));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an institution and optionally its email domains' })
  async create(@Body() dto: CreateInstitutionDto): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.create(dto));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstitutionDto,
  ): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.from(await this.institutions.update(id, dto));
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.institutions.remove(id);
  }

  @Post(':id/domains')
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
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
