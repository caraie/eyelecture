import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lectures, and the files they carry.
 *
 * Two tables rather than a handful of columns on one. A lecture can have a
 * presentation, a video and a tile image; each needs a key, a name, a type, a
 * size and a moment it was confirmed, and three sets of five columns is a table
 * nobody can read. The unique index on (lectureId, kind) is what keeps it to
 * one file of each kind — replacing a presentation updates that row rather than
 * leaving two and no way to say which is current.
 *
 * The foreign keys say what should survive what:
 *
 * - subsection: RESTRICT. A subsection holding lectures cannot be deleted; the
 *   service says how many have to move first, and this is the backstop.
 * - author and institution: SET NULL, matching how the rest of the app treats
 *   attribution. Deleting an account must not delete the lectures it wrote.
 * - assets: CASCADE. They are parts of the lecture, not records about it, and a
 *   file row whose lecture is gone is litter. The objects in the bucket are
 *   removed by the service before the row goes, since Postgres cannot reach
 *   into Cloud Storage.
 */
export class Lectures1756100000000 implements MigrationInterface {
  name = 'Lectures1756100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "lecture_status_enum" AS ENUM ('draft', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "lecture_visibility_enum" AS ENUM ('all_institutions', 'own_institution')`,
    );
    await queryRunner.query(
      `CREATE TYPE "lecture_asset_kind_enum" AS ENUM ('presentation', 'video', 'tile')`,
    );

    await queryRunner.query(`
      CREATE TABLE "lectures" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subsectionId" uuid NOT NULL,
        "title" character varying(300) NOT NULL,
        "objectives" text,
        "keywords" text NOT NULL DEFAULT '',
        "authorId" uuid,
        "institutionId" uuid,
        "visibility" "lecture_visibility_enum" NOT NULL DEFAULT 'all_institutions',
        "status" "lecture_status_enum" NOT NULL DEFAULT 'draft',
        "publishedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lectures" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "lecture_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lectureId" uuid NOT NULL,
        "kind" "lecture_asset_kind_enum" NOT NULL,
        "objectKey" character varying(500) NOT NULL,
        "fileName" character varying(300) NOT NULL,
        "contentType" character varying(150) NOT NULL,
        "sizeBytes" bigint NOT NULL,
        "uploadedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_assets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "lectures"
      ADD CONSTRAINT "FK_lectures_subsection"
      FOREIGN KEY ("subsectionId") REFERENCES "lecture_subsections"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lectures"
      ADD CONSTRAINT "FK_lectures_author"
      FOREIGN KEY ("authorId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lectures"
      ADD CONSTRAINT "FK_lectures_institution"
      FOREIGN KEY ("institutionId") REFERENCES "institutions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lecture_assets"
      ADD CONSTRAINT "FK_lecture_assets_lecture"
      FOREIGN KEY ("lectureId") REFERENCES "lectures"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_lectures_subsection" ON "lectures" ("subsectionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lectures_status" ON "lectures" ("status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_lecture_assets_lecture_kind" ON "lecture_assets" ("lectureId", "kind")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_lecture_assets_lecture_kind"`);
    await queryRunner.query(`DROP INDEX "IDX_lectures_status"`);
    await queryRunner.query(`DROP INDEX "IDX_lectures_subsection"`);
    await queryRunner.query(
      `ALTER TABLE "lecture_assets" DROP CONSTRAINT "FK_lecture_assets_lecture"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lectures" DROP CONSTRAINT "FK_lectures_institution"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lectures" DROP CONSTRAINT "FK_lectures_author"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lectures" DROP CONSTRAINT "FK_lectures_subsection"`,
    );
    await queryRunner.query(`DROP TABLE "lecture_assets"`);
    await queryRunner.query(`DROP TABLE "lectures"`);
    await queryRunner.query(`DROP TYPE "lecture_asset_kind_enum"`);
    await queryRunner.query(`DROP TYPE "lecture_visibility_enum"`);
    await queryRunner.query(`DROP TYPE "lecture_status_enum"`);
  }
}
