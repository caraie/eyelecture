import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CatalogItem } from '../entities/catalog-item.entity';

/**
 * Collapses runs of whitespace and trims. Without it "Retina  & Vitreous" and
 * "Retina & Vitreous" are two different entries that look identical in a dropdown,
 * which is the failure mode these lists exist to prevent.
 */
export const normalizeName = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

export class CreateCatalogItemDto {
  @ApiProperty({ example: 'Cornea & External Disease' })
  @IsString()
  @Transform(({ value }) => normalizeName(String(value ?? '')))
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto) {}

export class CatalogItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;

  static from(item: CatalogItem): CatalogItemResponseDto {
    return {
      id: item.id,
      name: item.name,
      isActive: item.isActive,
      createdAt: item.createdAt,
    };
  }
}

/** What the signup form sees. No timestamps, no retired entries. */
export class PublicCatalogItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;

  static from(item: CatalogItem): PublicCatalogItemDto {
    return { id: item.id, name: item.name };
  }
}
