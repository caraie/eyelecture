import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Co-authors on a lecture, whether or not they have an account yet.
 *
 * One table for both: a colleague who is already registered, and one who has
 * only been written to. They are one person at two stages, so the invitation
 * becomes the co-author in place rather than being copied into a second row.
 *
 * Two partial unique indexes carry the rules. The first says one person per
 * lecture; the second says one live invitation per address per lecture. Both
 * are restricted to rows that are still standing, so withdrawing somebody and
 * inviting them again works, and the history of who was once credited is not
 * destroyed to make room.
 *
 * `LOWER(email)` because addresses are compared without case everywhere else
 * in this schema, and a functional index cannot be declared on the entity
 * without `migration:generate` trying to replace it on every run.
 */
export class LectureCoAuthors1756400000000 implements MigrationInterface {
  name = 'LectureCoAuthors1756400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lecture_co_authors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lectureId" uuid NOT NULL,
        "userId" uuid,
        "email" character varying(320),
        "invitedName" character varying(200),
        "tokenHash" character varying(64),
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "acceptedAt" TIMESTAMP WITH TIME ZONE,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "invitedById" uuid,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_co_authors" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_lecture_co_authors_who"
          CHECK ("userId" IS NOT NULL OR "email" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "lecture_co_authors"
      ADD CONSTRAINT "FK_lecture_co_authors_lecture"
      FOREIGN KEY ("lectureId") REFERENCES "lectures"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lecture_co_authors"
      ADD CONSTRAINT "FK_lecture_co_authors_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lecture_co_authors"
      ADD CONSTRAINT "FK_lecture_co_authors_invited_by"
      FOREIGN KEY ("invitedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_lecture_co_authors_lecture" ON "lecture_co_authors" ("lectureId")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lecture_co_authors_person"
      ON "lecture_co_authors" ("lectureId", "userId")
      WHERE "userId" IS NOT NULL AND "revokedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lecture_co_authors_invitation"
      ON "lecture_co_authors" ("lectureId", LOWER("email"))
      WHERE "userId" IS NULL AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lecture_co_authors_token"
      ON "lecture_co_authors" ("tokenHash")
      WHERE "tokenHash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_lecture_co_authors_token"`);
    await queryRunner.query(`DROP INDEX "UQ_lecture_co_authors_invitation"`);
    await queryRunner.query(`DROP INDEX "UQ_lecture_co_authors_person"`);
    await queryRunner.query(`DROP INDEX "IDX_lecture_co_authors_lecture"`);
    await queryRunner.query(`DROP TABLE "lecture_co_authors"`);
  }
}
