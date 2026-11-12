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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LectureBankService } from './lecture-bank.service';
import {
  CreateSectionDto,
  CreateSubsectionDto,
  ReorderDto,
  SectionResponseDto,
  SubsectionResponseDto,
  UpdateSectionDto,
  UpdateSubsectionDto,
} from './dto/section.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';

/** Who may shape the catalogue. Everyone else reads it. */
const CURATOR_ROLES = [
  UserRole.SUPER_USER,
  UserRole.PROGRAM_ADMINISTRATOR,
] as const;

/**
 * Sections and the Subsections inside them — the shelves of the Lecture Bank.
 *
 * Reading is open to any signed-in account, because browsing the catalogue is
 * the point of the product. Writing belongs to the two administrative ranks: a
 * renamed section changes what every learner sees at once, and unlike a profile
 * there is nobody who would notice their own data looking wrong.
 */
@ApiTags('lecture-bank')
@Controller('lecture-bank')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class LectureBankController {
  constructor(private readonly bank: LectureBankService) {}

  @Get('sections')
  @ApiOperation({ summary: 'The catalogue: sections with their subsections' })
  async findTree(): Promise<SectionResponseDto[]> {
    const sections = await this.bank.findTree();
    return sections.map(SectionResponseDto.from);
  }

  @Post('sections')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: 'Add a section' })
  async createSection(@Body() dto: CreateSectionDto): Promise<SectionResponseDto> {
    const section = await this.bank.createSection(dto);
    return SectionResponseDto.from(section);
  }

  @Patch('sections/order')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: 'Reorder the sections, listing them all' })
  async reorderSections(@Body() dto: ReorderDto): Promise<SectionResponseDto[]> {
    const sections = await this.bank.reorderSections(dto.ids);
    return sections.map(SectionResponseDto.from);
  }

  @Patch('sections/:id')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: 'Rename a section or change its description' })
  async updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionDto,
  ): Promise<SectionResponseDto> {
    const section = await this.bank.updateSection(id, dto);
    return SectionResponseDto.from(section);
  }

  @Delete('sections/:id')
  @Roles(...CURATOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty section' })
  async removeSection(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.bank.removeSection(id);
  }

  @Post('sections/:id/subsections')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: 'Add a subsection to a section' })
  async createSubsection(
    @Param('id', ParseUUIDPipe) sectionId: string,
    @Body() dto: CreateSubsectionDto,
  ): Promise<SubsectionResponseDto> {
    const subsection = await this.bank.createSubsection(sectionId, dto);
    return SubsectionResponseDto.from(subsection);
  }

  @Patch('sections/:id/subsections/order')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: "Reorder one section's subsections" })
  async reorderSubsections(
    @Param('id', ParseUUIDPipe) sectionId: string,
    @Body() dto: ReorderDto,
  ): Promise<SectionResponseDto> {
    const section = await this.bank.reorderSubsections(sectionId, dto.ids);
    return SectionResponseDto.from(section);
  }

  @Patch('subsections/:id')
  @Roles(...CURATOR_ROLES)
  @ApiOperation({ summary: 'Rename a subsection, or move it to another section' })
  async updateSubsection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubsectionDto,
  ): Promise<SubsectionResponseDto> {
    const subsection = await this.bank.updateSubsection(id, dto);
    return SubsectionResponseDto.from(subsection);
  }

  @Delete('subsections/:id')
  @Roles(...CURATOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a subsection that holds no lectures' })
  async removeSubsection(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.bank.removeSubsection(id);
  }
}
