import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CoAuthorDto } from './co-author.dto';
import { Lecture } from '../entities/lecture.entity';
import { LectureAsset } from '../entities/lecture-asset.entity';
import { LectureAssetKind } from '../enums/lecture-asset-kind.enum';
import { AssetConversionStatus } from '../enums/asset-conversion-status.enum';
import { LectureStatus } from '../enums/lecture-status.enum';
import { LectureVisibility } from '../enums/lecture-visibility.enum';

const clean = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export class CreateLectureDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subsectionId!: string;

  @ApiProperty({ example: 'Angle closure: recognising it in clinic' })
  @IsString()
  @Transform(({ value }) => clean(value))
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  /** Rich text. Left as typed, apart from trimming — it is HTML, not a label. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  objectives?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map(clean).filter(Boolean))].slice(0, 25)
      : [],
  )
  keywords?: string[];

  @ApiPropertyOptional({ enum: LectureVisibility })
  @IsOptional()
  @IsEnum(LectureVisibility)
  visibility?: LectureVisibility;

  /**
   * Who wrote it. Left out means the person creating it, which is almost
   * always right — an administrator filing a colleague's deck is the case
   * this exists for.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  authorId?: string;
}

export class UpdateLectureDto extends PartialType(CreateLectureDto) {}

/**
 * What the browser asks for before uploading: "I am about to send this file,
 * of this type and this size — where do I put it?". The server decides the key
 * and whether the type is allowed; nothing here is trusted as a path.
 */
export class RequestUploadDto {
  @ApiProperty({ example: 'angle-closure.pdf' })
  @IsString()
  @MaxLength(300)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(150)
  contentType!: string;

  @ApiProperty({ example: 4_194_304 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class LectureAssetDto {
  @ApiProperty({ enum: LectureAssetKind }) kind!: LectureAssetKind;
  @ApiProperty() fileName!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true }) uploadedAt!: Date | null;
  @ApiProperty({
    enum: AssetConversionStatus,
    description: '"none" for a file that needed no converting',
  })
  conversionStatus!: AssetConversionStatus;
  @ApiProperty({ nullable: true, description: 'Only set when it failed' })
  conversionError!: string | null;
  @ApiProperty({ description: 'There is an editable original behind the PDF' })
  hasOriginal!: boolean;

  static from(asset: LectureAsset): LectureAssetDto {
    return {
      kind: asset.kind,
      fileName: asset.fileName,
      contentType: asset.contentType,
      conversionStatus: asset.conversionStatus,
      conversionError: asset.conversionError,
      hasOriginal: asset.conversionStatus !== AssetConversionStatus.NONE,
      // bigint comes back from pg as a string, which would quietly become
      // "4194304" in JSON and sort wrong in any UI that compares sizes.
      sizeBytes: Number(asset.sizeBytes),
      uploadedAt: asset.uploadedAt,
    };
  }
}

export class UploadTicketDto {
  @ApiProperty() url!: string;
  @ApiProperty() headers!: Record<string, string>;
  @ApiProperty() expiresAt!: Date;
}

export class LectureResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() subsectionId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) objectives!: string | null;
  @ApiProperty({ type: [String] }) keywords!: string[];
  @ApiProperty({ enum: LectureStatus }) status!: LectureStatus;
  @ApiProperty({ enum: LectureVisibility }) visibility!: LectureVisibility;
  @ApiProperty({ nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ nullable: true }) authorId!: string | null;
  @ApiProperty({ nullable: true }) authorName!: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Who filed it, when that is not who wrote it',
  })
  createdByName!: string | null;
  @ApiProperty({ nullable: true }) institutionName!: string | null;
  @ApiProperty({ type: [CoAuthorDto] }) coAuthors!: CoAuthorDto[];
  @ApiProperty({ type: [LectureAssetDto] }) assets!: LectureAssetDto[];
  @ApiProperty({ description: 'Zero means the lecture has no quiz' })
  questionCount!: number;
  @ApiProperty({ enum: ['pre', 'post', 'both'] }) quizAvailability!: string;
  @ApiProperty() createdAt!: Date;

  static from(lecture: Lecture): LectureResponseDto {
    const author = lecture.author;
    return {
      id: lecture.id,
      subsectionId: lecture.subsectionId,
      title: lecture.title,
      objectives: lecture.objectives,
      keywords: lecture.keywords ?? [],
      status: lecture.status,
      visibility: lecture.visibility,
      publishedAt: lecture.publishedAt,
      // Null when the account was deleted. The screen says "Author removed"
      // rather than inventing a name.
      authorId: lecture.authorId,
      authorName: author ? `${author.firstName} ${author.lastName}`.trim() : null,
      // Only worth saying when it differs — "filed by" the author themselves
      // is noise on every other lecture.
      createdByName:
        lecture.createdBy && lecture.createdById !== lecture.authorId
          ? `${lecture.createdBy.firstName} ${lecture.createdBy.lastName}`.trim()
          : null,
      institutionName: lecture.institution?.name ?? null,
      coAuthors: (lecture.coAuthors ?? []).map(CoAuthorDto.from),
      assets: (lecture.assets ?? [])
        .filter((asset) => asset.uploadedAt !== null)
        .map(LectureAssetDto.from),
      questionCount: lecture.questionCount ?? 0,
      quizAvailability: lecture.quizAvailability,
      createdAt: lecture.createdAt,
    };
  }
}
