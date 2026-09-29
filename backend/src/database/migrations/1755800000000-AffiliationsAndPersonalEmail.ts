import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The September review turned the two addresses around.
 *
 * The institutional address used to be the required one, because it was what tied
 * an account to an institution. The personal one was the optional extra. But a
 * student loses their school mailbox the day they graduate, and with it the account
 * — so the personal address becomes the anchor, and the institutional one becomes a
 * property of an affiliation, of which somebody may hold several over time.
 *
 * Three moves, in order:
 *
 * 1. `secondaryEmail` is renamed to `personalEmail`. A rename rather than a new
 *    column: the data in it is already exactly what the new column means, and every
 *    address anybody has given us is worth keeping.
 * 2. `user_affiliations` is created and backfilled from the single `institutionId`
 *    each user carries today. Everyone keeps the institution they had.
 * 3. `trainingLevelId` joins the user, for the PGY the review asked residents for.
 *
 * `personalEmail` stays nullable on purpose. Making it NOT NULL would mean inventing
 * an address for every account that predates this, and there is no honest value to
 * invent. `PersonalEmailGuard` pins those accounts to a single screen instead, which
 * is the same shape as the pending-profile state they already understand.
 */
export class AffiliationsAndPersonalEmail1755800000000
  implements MigrationInterface
{
  name = 'AffiliationsAndPersonalEmail1755800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. the personal address ---------------------------------------------
    // Dropped before the rename rather than renamed with it: the index is partial,
    // and its predicate names the column. Rebuilding it afterwards is cheap and
    // leaves nothing to reason about.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_secondaryEmail"`);
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "secondaryEmail" TO "personalEmail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "secondaryEmailVerifiedAt" TO "personalEmailVerifiedAt"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_personalEmail"
      ON "users" ("personalEmail")
      WHERE "personalEmail" IS NOT NULL
    `);

    // --- 2. affiliations ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "user_affiliations" (
        "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
        "userId"             uuid         NOT NULL,
        "institutionId"      uuid         NOT NULL,
        "institutionalEmail" varchar(320),
        "emailDomain"        varchar(253),
        "emailVerifiedAt"    timestamptz,
        "startedAt"          timestamptz  NOT NULL DEFAULT now(),
        "endedAt"            timestamptz,
        "createdAt"          timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_affiliations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_affiliations_user"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_affiliations_institution"
          FOREIGN KEY ("institutionId") REFERENCES "institutions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_affiliations_user_institution"
      ON "user_affiliations" ("userId", "institutionId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_affiliations_emailDomain"
      ON "user_affiliations" ("emailDomain")
    `);
    // One institutional address belongs to one person, however many they hold.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_affiliations_email"
      ON "user_affiliations" (LOWER("institutionalEmail"))
      WHERE "institutionalEmail" IS NOT NULL
    `);

    // Backfill: the institution somebody has now becomes their first affiliation,
    // dated from when it was confirmed, or from when the account was made if it
    // never was.
    await queryRunner.query(`
      INSERT INTO "user_affiliations"
        ("userId", "institutionId", "institutionalEmail", "emailDomain",
         "emailVerifiedAt", "startedAt")
      SELECT
        "id", "institutionId", "email", "emailDomain",
        "emailVerifiedAt", COALESCE("validatedAt", "createdAt")
      FROM "users"
      WHERE "institutionId" IS NOT NULL
    `);

    // --- 3. training level ----------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "trainingLevelId" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_trainingLevel"
      FOREIGN KEY ("trainingLevelId") REFERENCES "training_levels" ("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_trainingLevel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "trainingLevelId"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "user_affiliations"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_personalEmail"`);
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "personalEmailVerifiedAt" TO "secondaryEmailVerifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "personalEmail" TO "secondaryEmail"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_secondaryEmail"
      ON "users" ("secondaryEmail")
      WHERE "secondaryEmail" IS NOT NULL
    `);
  }
}
