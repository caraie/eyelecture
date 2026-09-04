import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registration becomes two steps: a username and a password first, everything else
 * afterwards. That forces three changes to the users table.
 *
 * 1. `username`, which is now what people sign in with. Existing accounts get one
 *    derived from their email address rather than being deleted — wiping the table
 *    would take both administrators with it, and the seed script that would
 *    recreate them is run by hand and never reaches production.
 *
 * 2. `email` and `emailDomain` become nullable. Step one has no address to store,
 *    and a placeholder would be worse than a NULL: it would satisfy every check
 *    that exists to find accounts without one.
 *
 * 3. The role enum is replaced outright by the five ranks plus admin. Both enums
 *    are rebuilt rather than altered in place — ALTER TYPE ... ADD VALUE has rules
 *    about running inside a transaction, and rebuilding has none.
 */
export class UsernameAndRanks1755400000000 implements MigrationInterface {
  name = 'UsernameAndRanks1755400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- username ------------------------------------------------------------
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "username" varchar(30)`);

    // Local part of the address, stripped to the characters a username may hold.
    // Duplicates get a numeric suffix by creation order; anything too short to be
    // a username falls back to a slice of the id, which is unique by construction.
    await queryRunner.query(`
      WITH numbered AS (
        SELECT
          "id",
          regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g') AS base,
          row_number() OVER (
            PARTITION BY regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g')
            ORDER BY "createdAt"
          ) AS n
        FROM "users"
      )
      UPDATE "users" u
      SET "username" = CASE
        WHEN length(numbered.base) < 3
          THEN 'user' || left(replace(u."id"::text, '-', ''), 8)
        WHEN numbered.n = 1 THEN numbered.base
        ELSE numbered.base || numbered.n::text
      END
      FROM numbered
      WHERE u."id" = numbered."id"
    `);

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_username" ON "users" (LOWER("username"))`,
    );

    // --- email is optional until the profile is completed ---------------------
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "emailDomain" DROP NOT NULL`,
    );

    // --- roles ---------------------------------------------------------------
    await queryRunner.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`);
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM (
        'medical_student', 'resident', 'fellow',
        'attending_physician', 'residency_administrator', 'admin'
      )
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
      USING (
        CASE "role"::text
          WHEN 'student'          THEN 'medical_student'
          WHEN 'program_director' THEN 'residency_administrator'
          ELSE 'admin'
        END
      )::"users_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'medical_student'`,
    );
    await queryRunner.query(`DROP TYPE "users_role_enum_old"`);

    // --- statuses ------------------------------------------------------------
    await queryRunner.query(
      `ALTER TYPE "users_status_enum" RENAME TO "users_status_enum_old"`,
    );
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM (
        'pending_profile', 'pending_email_verification', 'active', 'suspended'
      )
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" TYPE "users_status_enum"
      USING "status"::text::"users_status_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending_profile'`,
    );
    await queryRunner.query(`DROP TYPE "users_status_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Accounts that never got past step one have no email and cannot be
    // represented by the old schema at all, so they go.
    await queryRunner.query(`DELETE FROM "users" WHERE "email" IS NULL`);

    await queryRunner.query(
      `ALTER TYPE "users_status_enum" RENAME TO "users_status_enum_new"`,
    );
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM (
        'pending_email_verification', 'active', 'suspended'
      )
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" TYPE "users_status_enum"
      USING (
        CASE "status"::text
          WHEN 'pending_profile' THEN 'pending_email_verification'
          ELSE "status"::text
        END
      )::"users_status_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending_email_verification'`,
    );
    await queryRunner.query(`DROP TYPE "users_status_enum_new"`);

    await queryRunner.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_new"`);
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('admin', 'program_director', 'student')
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
      USING (
        CASE "role"::text
          WHEN 'admin'                   THEN 'admin'
          WHEN 'residency_administrator' THEN 'program_director'
          ELSE 'student'
        END
      )::"users_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student'`,
    );
    await queryRunner.query(`DROP TYPE "users_role_enum_new"`);

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "emailDomain" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`);

    await queryRunner.query(`DROP INDEX "UQ_users_username"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
