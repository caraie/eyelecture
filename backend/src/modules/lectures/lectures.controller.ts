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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LecturesService } from './lectures.service';
import {
  CreateLectureDto,
  LectureResponseDto,
  RequestUploadDto,
  UpdateLectureDto,
  UploadTicketDto,
} from './dto/lecture.dto';
import { LectureAssetKind } from './enums/lecture-asset-kind.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

/** Who may write a lecture. Learners read; the people who teach, write. */
const AUTHOR_ROLES = [
  UserRole.SUPER_USER,
  UserRole.PROGRAM_ADMINISTRATOR,
  UserRole.ATTENDING_PHYSICIAN,
  UserRole.FELLOW,
] as const;

@ApiTags('lectures')
@Controller('lectures')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class LecturesController {
  constructor(private readonly lectures: LecturesService) {}

  @Get()
  @ApiOperation({ summary: 'Published lectures, filtered by shelf' })
  @ApiQuery({ name: 'subsectionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  async findAll(
    @CurrentUser() user: User,
    @Query('subsectionId') subsectionId?: string,
    @Query('sectionId') sectionId?: string,
  ): Promise<LectureResponseDto[]> {
    const lectures = await this.lectures.findPublished(user, {
      subsectionId,
      sectionId,
    });
    return lectures.map(LectureResponseDto.from);
  }

  @Get('mine')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Your own lectures, drafts included' })
  async findMine(@CurrentUser() user: User): Promise<LectureResponseDto[]> {
    const lectures = await this.lectures.findMine(user);
    return lectures.map(LectureResponseDto.from);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(await this.lectures.findOneFor(id, user));
  }

  @Post()
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Start a lecture as a draft' })
  async create(
    @Body() dto: CreateLectureDto,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(await this.lectures.create(dto, user));
  }

  @Patch(':id')
  @Roles(...AUTHOR_ROLES)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLectureDto,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(await this.lectures.update(id, dto, user));
  }

  @Post(':id/publish')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Put it in the bank for learners' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(await this.lectures.publish(id, user));
  }

  @Post(':id/unpublish')
  @Roles(...AUTHOR_ROLES)
  async unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(await this.lectures.unpublish(id, user));
  }

  @Delete(':id')
  @Roles(...AUTHOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.lectures.remove(id, user);
  }

  // --- Files ------------------------------------------------------------------

  @Post(':id/files/:kind/upload-url')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Where to PUT this file, for the next hour' })
  async requestUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @Body() dto: RequestUploadDto,
    @CurrentUser() user: User,
  ): Promise<UploadTicketDto> {
    return this.lectures.requestUpload(id, kind, dto, user);
  }

  @Post(':id/files/:kind/confirm')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Tell the API the bytes are there, and have it check' })
  async confirmUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(
      await this.lectures.confirmUpload(id, kind, user),
    );
  }

  @Delete(':id/files/:kind')
  @Roles(...AUTHOR_ROLES)
  async removeAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(
      await this.lectures.removeAsset(id, kind, user),
    );
  }

  @Post(':id/files/:kind/convert')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({
    summary: 'Try a failed conversion again',
    description: 'The deck is already in the bucket; this does not re-upload it.',
  })
  async retryConversion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @CurrentUser() user: User,
  ): Promise<LectureResponseDto> {
    return LectureResponseDto.from(
      await this.lectures.retryConversion(id, kind, user),
    );
  }

  @Get(':id/files/:kind/url')
  @ApiOperation({
    summary: 'A short-lived link to read one file',
    description:
      'For a converted deck this is the PDF. Anyone who can see the lecture ' +
      'may ask for it.',
  })
  async fileUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @CurrentUser() user: User,
  ): Promise<{ url: string; contentType: string }> {
    return this.lectures.fileUrl(id, kind, user);
  }

  @Get(':id/files/:kind/original')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({
    summary: 'The file as it was uploaded — the editable deck, not the PDF',
  })
  async originalUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(LectureAssetKind)) kind: LectureAssetKind,
    @CurrentUser() user: User,
  ): Promise<{ url: string; contentType: string }> {
    return this.lectures.fileUrl(id, kind, user, true);
  }
}
