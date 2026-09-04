import { MigrationInterface, QueryRunner } from 'typeorm';

/** The real list, as given by Dr. Shrivastava. */
const SPECIALTIES = [
  'Comprehensive Ophthalmology',
  'Cornea & External Disease',
  'Glaucoma',
  'Retina & Vitreous',
  'Neuro-Ophthalmology',
  'Pediatric Ophthalmology and Adult Strabismus',
  'Oculoplastics',
  'Uveitis',
  'Optometry',
];

/**
 * Placeholders until the real lists arrive. They exist so the pickers have
 * something in them; deleting them from the admin screen is expected.
 */
const EXAMPLE_RESIDENCIES = [
  'Montefiore-Einstein',
  'Stanford University School of Medicine',
  'Wilmer Eye Institute',
];

const EXAMPLE_FELLOWSHIPS = [
  'Bascom Palmer Eye Institute',
  'Massachusetts Eye and Ear',
  'Stanford Medical Center',
];

/**
 * The three reference lists a profile is built from.
 *
 * Three tables rather than one with a `kind` column: they are identical today, but
 * a residency program will want an institution and a location, and a specialty
 * never will. The cost of splitting them later is a data migration; the cost of
 * keeping them apart now is two extra CREATE TABLEs.
 *
 * Uniqueness is on LOWER("name") rather than on "name". Without that, "Glaucoma"
 * and "glaucoma" both get in and the picker shows what looks like the same entry
 * twice — which is the exact failure these lists exist to prevent.
 */
export class CatalogLists1755300000000 implements MigrationInterface {
  name = 'CatalogLists1755300000000';

  private static readonly TABLES = [
    'specialties',
    'residency_programs',
    'fellowship_programs',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of CatalogLists1755300000000.TABLES) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "id"        uuid         NOT NULL DEFAULT gen_random_uuid(),
          "name"      varchar(200) NOT NULL,
          "isActive"  boolean      NOT NULL DEFAULT true,
          "createdAt" timestamptz  NOT NULL DEFAULT now(),
          "updatedAt" timestamptz  NOT NULL DEFAULT now(),
          CONSTRAINT "PK_${table}" PRIMARY KEY ("id")
        )
      `);

      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_${table}_name" ON "${table}" (LOWER("name"))`,
      );
    }

    await this.seed(queryRunner, 'specialties', SPECIALTIES);
    await this.seed(queryRunner, 'residency_programs', EXAMPLE_RESIDENCIES);
    await this.seed(queryRunner, 'fellowship_programs', EXAMPLE_FELLOWSHIPS);
  }

  /**
   * Reference data, so it ships with the schema rather than sitting in the seed
   * script — that one is run by hand and would never reach production.
   *
   * A plain INSERT: the table is created a few statements above, in this same
   * transaction, so there is nothing to collide with.
   */
  private async seed(
    queryRunner: QueryRunner,
    table: string,
    names: string[],
  ): Promise<void> {
    const values = names.map((_, i) => `($${i + 1})`).join(', ');
    await queryRunner.query(
      `INSERT INTO "${table}" ("name") VALUES ${values}`,
      names,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...CatalogLists1755300000000.TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
