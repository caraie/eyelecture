import { MigrationInterface, QueryRunner } from 'typeorm';

/** Asked of residents. A list, not an integer — see the entity for why. */
const LEVELS = [
  'PGY-1',
  'PGY-2',
  'PGY-3',
  'PGY-4',
  'PGY-5',
  'PGY-6',
  'PGY-7',
];

/**
 * A fourth reference list, plus explicit ordering on all of them.
 *
 * Two things the September review asked for:
 *
 * - Residents are asked for their PGY level, which needs a list an administrator
 *   owns rather than a hardcoded range.
 * - "Non-clinical" joins the specialties, so a program coordinator or clerical
 *   member of staff has an honest answer to a question the form insists on.
 *
 * Ordering comes along because both of those break alphabetical sorting. PGY-10
 * would sort between PGY-1 and PGY-2, and "Non-clinical" would land in the middle
 * of the ophthalmology subspecialties rather than at the end where it reads as the
 * exception it is. Everything left at 0 still falls back to name.
 */
export class TrainingLevelsAndOrdering1755700000000 implements MigrationInterface {
  name = 'TrainingLevelsAndOrdering1755700000000';

  private static readonly TABLES = [
    'specialties',
    'residency_programs',
    'fellowship_programs',
    'training_levels',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "training_levels" (
        "id"        uuid         NOT NULL DEFAULT gen_random_uuid(),
        "name"      varchar(200) NOT NULL,
        "isActive"  boolean      NOT NULL DEFAULT true,
        "createdAt" timestamptz  NOT NULL DEFAULT now(),
        "updatedAt" timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_training_levels" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_training_levels_name" ON "training_levels" (LOWER("name"))`,
    );

    for (const table of TrainingLevelsAndOrdering1755700000000.TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "sortOrder" integer NOT NULL DEFAULT 0`,
      );
    }

    // PGY-1 … PGY-7, in that order rather than in the order a string sort would pick.
    const values = LEVELS.map((_, i) => `($${i + 1}, ${i + 1})`).join(', ');
    await queryRunner.query(
      `INSERT INTO "training_levels" ("name", "sortOrder") VALUES ${values}`,
      LEVELS,
    );

    // Last in the list on purpose: it is the way out of a question about clinical
    // practice, not one more answer to it.
    await queryRunner.query(
      `INSERT INTO "specialties" ("name", "sortOrder") VALUES ('Non-clinical', 100)
       ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "specialties" WHERE LOWER("name") = 'non-clinical'`,
    );
    for (const table of TrainingLevelsAndOrdering1755700000000.TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "sortOrder"`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "training_levels"`);
  }
}
