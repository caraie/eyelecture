import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who filed a lecture and who wrote it are not always the same person.
 *
 * A program administrator often puts a colleague's deck in the bank. Until now
 * the creator was the author, and the only way to credit the real one was to
 * add them as a co-author — which says something different.
 *
 * Existing rows are backfilled from `authorId`, because up to this point the
 * person who created a lecture *was* its author. Afterwards the two move
 * independently.
 */
export class LectureCreator1756600000000 implements MigrationInterface {
  name = 'LectureCreator1756600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lectures" ADD COLUMN "createdById" uuid`,
    );
    await queryRunner.query(
      `UPDATE "lectures" SET "createdById" = "authorId" WHERE "createdById" IS NULL`,
    );

    // SET NULL rather than CASCADE, like the author column: a deleted account
    // should not take a lecture other people are reading with it.
    await queryRunner.query(`
      ALTER TABLE "lectures"
      ADD CONSTRAINT "FK_lectures_created_by"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lectures_created_by" ON "lectures" ("createdById")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_lectures_created_by"`);
    await queryRunner.query(
      `ALTER TABLE "lectures" DROP CONSTRAINT "FK_lectures_created_by"`,
    );
    await queryRunner.query(`ALTER TABLE "lectures" DROP COLUMN "createdById"`);
  }
}
