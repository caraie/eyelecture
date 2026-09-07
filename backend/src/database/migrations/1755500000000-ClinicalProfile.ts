import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What an attending physician records about their own practice: a clinical focus,
 * and where they trained.
 *
 * All three are nullable and none is constrained to a rank at the database level.
 * The rule that only attendings fill them in is a product decision that is already
 * being revisited — a resident is *in* a residency rather than looking back on one,
 * and whether they should name it is still open. Encoding today's answer as a CHECK
 * constraint would mean a migration to change our minds.
 *
 * ON DELETE SET NULL, matching institutions: deleting a programme from the reference
 * lists must not delete the people who trained there.
 */
export class ClinicalProfile1755500000000 implements MigrationInterface {
  name = 'ClinicalProfile1755500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "specialtyId"         uuid,
        ADD COLUMN "residencyProgramId"  uuid,
        ADD COLUMN "fellowshipProgramId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_specialty"
          FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_users_residency_program"
          FOREIGN KEY ("residencyProgramId") REFERENCES "residency_programs"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_users_fellowship_program"
          FOREIGN KEY ("fellowshipProgramId") REFERENCES "fellowship_programs"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT "FK_users_fellowship_program",
        DROP CONSTRAINT "FK_users_residency_program",
        DROP CONSTRAINT "FK_users_specialty"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "fellowshipProgramId",
        DROP COLUMN "residencyProgramId",
        DROP COLUMN "specialtyId"
    `);
  }
}
