import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two renames agreed in the September review:
 *
 *   admin                   → super_user
 *   residency_administrator → program_administrator
 *
 * The first separates the platform's own staff from an institution's administrator,
 * which the word "admin" was quietly conflating. The second drops "residency"
 * because a fellowship need not hang off one, and whoever runs it still vouches for
 * its trainees.
 *
 * Postgres cannot rename a value inside an enum type and keep the column's default
 * intact in one step, so this does the usual dance: rename the type aside, create
 * the new one, move the column across with an explicit mapping, drop the old type.
 * The default has to be dropped first — Postgres will not cast it for us.
 */
export class RoleRename1755600000000 implements MigrationInterface {
  name = 'RoleRename1755600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM (
        'medical_student', 'resident', 'fellow',
        'attending_physician', 'program_administrator', 'super_user'
      )
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
      USING (
        CASE "role"::text
          WHEN 'admin'                   THEN 'super_user'
          WHEN 'residency_administrator' THEN 'program_administrator'
          ELSE "role"::text
        END
      )::"users_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'medical_student'`,
    );
    await queryRunner.query(`DROP TYPE "users_role_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`,
    );
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
          WHEN 'super_user'            THEN 'admin'
          WHEN 'program_administrator' THEN 'residency_administrator'
          ELSE "role"::text
        END
      )::"users_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'medical_student'`,
    );
    await queryRunner.query(`DROP TYPE "users_role_enum_old"`);
  }
}
