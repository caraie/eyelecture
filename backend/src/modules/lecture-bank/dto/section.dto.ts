import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Section } from '../entities/section.entity';
import { Subsection } from '../entities/subsection.entity';

/**
 * Collapses runs of whitespace and trims, so "Retina  & Vitreous" and
 * "Retina & Vitreous" cannot both exist — they look identical in a sidebar, and
 * the catalogue is only worth having if there is one place per subject.
 */
export const normalizeName = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

export class CreateSectionDto {
  @ApiProperty({ example: 'Cornea & External Disease' })
  @IsString()
  @Transform(({ value }) => normalizeName(String(value ?? '')))
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Lectures on the cornea and the ocular surface.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === null || value === undefined ? value : normalizeName(String(value)),
  )
  @MaxLength(500)
  description?: string | null;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}

export class CreateSubsectionDto extends CreateSectionDto {}

export class UpdateSubsectionDto extends PartialType(CreateSubsectionDto) {
  /** Moving a subsection to another section is an edit like any other. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

/**
 * Reordering sends the whole list rather than one item's new position. The
 * alternative — "move this one to index 3" — needs the client and the server to
 * agree on what the list looked like a moment ago, and they do not when two
 * administrators are dragging at once. A full list is one statement of intent,
 * and the last one in wins.
 */
export class ReorderDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class SubsectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() sectionId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;

  static from(subsection: Subsection): SubsectionResponseDto {
    return {
      id: subsection.id,
      sectionId: subsection.sectionId,
      name: subsection.name,
      description: subsection.description,
      sortOrder: subsection.sortOrder,
    };
  }
}

export class SectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [SubsectionResponseDto] })
  subsections!: SubsectionResponseDto[];

  static from(section: Section): SectionResponseDto {
    return {
      id: section.id,
      name: section.name,
      description: section.description,
      sortOrder: section.sortOrder,
      subsections: (section.subsections ?? []).map((s) =>
        SubsectionResponseDto.from(s),
      ),
    };
  }
}
