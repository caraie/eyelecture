import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CatalogsService } from './catalogs.service';
import { CATALOG_KINDS, CatalogKind } from './catalog-kind.enum';
import {
  CatalogItemResponseDto,
  CreateCatalogItemDto,
  PublicCatalogItemDto,
  UpdateCatalogItemDto,
} from './dto/catalog-item.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';

/**
 * The reference lists a profile is built from. One controller for all three: the
 * operations are the same, and `:kind` is validated against the enum so an unknown
 * segment is a 400 rather than a route that quietly matches nothing.
 *
 * Editing these belongs to the super administrator alone. A wrong entry here shows
 * up in every signup form at once, and unlike a user record there is nobody who
 * would notice their own data looking wrong.
 */
@ApiTags('catalogs')
@Controller('catalogs')
@UseGuards(RolesGuard)
@ApiParam({ name: 'kind', enum: CATALOG_KINDS })
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  /** Backs the pickers on the signup form, before there is anybody to authenticate. */
  @Public()
  @Get(':kind/public')
  @ApiOperation({ summary: 'List the active entries of one catalog' })
  async findPublic(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
  ): Promise<PublicCatalogItemDto[]> {
    const items = await this.catalogs.findAll(kind, { activeOnly: true });
    return items.map(PublicCatalogItemDto.from);
  }

  @Get(':kind')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List every entry, retired ones included' })
  async findAll(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
  ): Promise<CatalogItemResponseDto[]> {
    const items = await this.catalogs.findAll(kind);
    return items.map(CatalogItemResponseDto.from);
  }

  @Post(':kind')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async create(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    return CatalogItemResponseDto.from(await this.catalogs.create(kind, dto));
  }

  @Patch(':kind/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rename an entry, or retire it by setting isActive to false',
  })
  async update(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    return CatalogItemResponseDto.from(await this.catalogs.update(kind, id, dto));
  }

  @Delete(':kind/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an entry outright',
    description:
      'For entries that should never have been added. Retiring is the answer for ' +
      'anything real that ended — it keeps the entry readable on the profiles that ' +
      'already point at it.',
  })
  async remove(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.catalogs.remove(kind, id);
  }
}
