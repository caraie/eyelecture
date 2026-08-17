import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two features, one migration because they touch the same table.
 *
 * 1. An optional personal address (`secondaryEmail`) that also signs the user in.
 *    Institutional mailboxes get switched off when people graduate or move on, and
 *    losing the mailbox should not mean losing the account.
 *
 * 2. `mustChangePassword`, for accounts an admin creates with a temporary password.
 *
 * The unique index on `secondaryEmail` is partial (`WHERE ... IS NOT NULL`). Postgres
 * would allow repeated NULLs under a plain unique index anyway, but saying so
 * explicitly keeps the index off the rows that do not have the column set — which is
 * most of them, since it is optional.
 *
 * Uniqueness *across* `email` and `secondaryEmail` is not expressible as a single
 * index without an exclusion constraint over a union, so it is enforced in
 * UsersService.emailInUse instead. Both columns are indexed, so that check is cheap.
 */
export class SecondaryEmailAndAdminManagement1755200000000 implements MigrationInterface {
  name = 'SecondaryEmailAndAdminManagement1755200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "secondaryEmail"           varchar(320),
        ADD COLUMN "secondaryEmailVerifiedAt" timestamptz,
        ADD COLUMN "mustChangePassword"       boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_secondaryEmail"
        ON "users" ("secondaryEmail")
        WHERE "secondaryEmail" IS NOT NULL
    `);

    // Verification tokens now say which address they confirm. Existing rows are all
    // primary-address tokens, and the column default covers them.
    await queryRunner.query(`
      CREATE TYPE "email_verification_tokens_purpose_enum" AS ENUM (
        'primary_email', 'secondary_email'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "email_verification_tokens"
        ADD COLUMN "purpose" "email_verification_tokens_purpose_enum"
          NOT NULL DEFAULT 'primary_email',
        ADD COLUMN "targetEmail" varchar(320)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_verification_tokens"
        DROP COLUMN "targetEmail",
        DROP COLUMN "purpose"
    `);
    await queryRunner.query(
      `DROP TYPE "email_verification_tokens_purpose_enum"`,
    );

    await queryRunner.query(`DROP INDEX "UQ_users_secondaryEmail"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "mustChangePassword",
        DROP COLUMN "secondaryEmailVerifiedAt",
        DROP COLUMN "secondaryEmail"
    `);
  }
}
