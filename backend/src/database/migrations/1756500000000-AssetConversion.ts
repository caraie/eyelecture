import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Authors upload the deck they actually work in; the viewer reads PDF.
 *
 * `derivedObjectKey` is the PDF made from the upload. The original is kept
 * alongside it rather than thrown away once converted: it is what a co-author
 * picks up to edit, and a PDF cannot be turned back into a deck.
 *
 * `conversionStatus` defaults to 'none', so every asset already in the table —
 * all of them PDFs uploaded as PDFs — reads correctly with no backfill.
 */
export class AssetConversion1756500000000 implements MigrationInterface {
  name = 'AssetConversion1756500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "asset_conversion_status_enum" AS ENUM ('none', 'pending', 'ready', 'failed')`,
    );
    await queryRunner.query(`
      ALTER TABLE "lecture_assets"
      ADD COLUMN "derivedObjectKey" character varying(500),
      ADD COLUMN "conversionStatus" "asset_conversion_status_enum" NOT NULL DEFAULT 'none',
      ADD COLUMN "conversionError" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lecture_assets"
      DROP COLUMN "conversionError",
      DROP COLUMN "conversionStatus",
      DROP COLUMN "derivedObjectKey"
    `);
    await queryRunner.query(`DROP TYPE "asset_conversion_status_enum"`);
  }
}
