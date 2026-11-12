import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The catalogue the Lecture Bank is browsed by: Sections, and the Subsections
 * inside them. Two levels, and every lecture will belong to exactly one
 * Subsection.
 *
 * Both unique indexes are on `LOWER("name")` rather than on `"name"`, the same
 * way the catalog lists do it. Postgres compares strings byte by byte, so
 * "Glaucoma" and "glaucoma" are two different rows to a plain unique index —
 * two shelves for the same subject, which is what this table exists to stop.
 * A functional index cannot be expressed on the entity, so it lives here alone
 * and the entities say so.
 *
 * The subsection's foreign key is ON DELETE RESTRICT, not CASCADE. Deleting a
 * section that still has subsections should fail loudly and let the service
 * explain what has to move first; a cascade would quietly take a shelf of
 * lectures with it.
 *
 * The twelve sections of the old app are seeded in `seed.ts`, not here. A
 * migration that inserts content has to be re-run by hand to change its mind
 * about it, and these names are the kind of thing a program director will want
 * to edit on day one.
 */
export class LectureBankSections1756000000000 implements MigrationInterface {
  name = 'LectureBankSections1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lecture_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "description" character varying(500),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_sections" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "lecture_subsections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sectionId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "description" character varying(500),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_subsections" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "lecture_subsections"
      ADD CONSTRAINT "FK_lecture_subsections_section"
      FOREIGN KEY ("sectionId") REFERENCES "lecture_sections"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_lecture_sections_name" ON "lecture_sections" (LOWER("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_lecture_subsections_section_name" ON "lecture_subsections" ("sectionId", LOWER("name"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lecture_subsections_section" ON "lecture_subsections" ("sectionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_lecture_subsections_section"`);
    await queryRunner.query(`DROP INDEX "UQ_lecture_subsections_section_name"`);
    await queryRunner.query(`DROP INDEX "UQ_lecture_sections_name"`);
    await queryRunner.query(
      `ALTER TABLE "lecture_subsections" DROP CONSTRAINT "FK_lecture_subsections_section"`,
    );
    await queryRunner.query(`DROP TABLE "lecture_subsections"`);
    await queryRunner.query(`DROP TABLE "lecture_sections"`);
  }
}
