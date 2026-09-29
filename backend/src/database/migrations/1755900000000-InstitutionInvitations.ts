import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How the first program administrator at an institution gets in.
 *
 * Until now the only route was a super user reaching into the validation queue after
 * the person had signed up and guessed the right institution. This turns it around:
 * the super user sends an invitation from the institution's own row, and the link
 * carries the institution and the rank with it, so there is nothing left to approve
 * when the person arrives.
 *
 * Two indexes, and the interesting one is partial. A second invitation to the same
 * address at the same institution is refused only while the first is still live —
 * pending, unspent, unwithdrawn. Once it is accepted, withdrawn or stale, inviting
 * that address again is a perfectly reasonable thing to want, and a plain unique
 * index would forbid it forever.
 *
 * `expiresAt` is compared inside the index predicate deliberately *not*: a predicate
 * cannot reference `now()`, because an index cannot quietly change shape as the clock
 * moves. So the index covers unaccepted-and-unrevoked, and the service treats an
 * expired row as reusable by revoking it first. The strictness lives in one place
 * either way, and it is the database that holds it.
 */
export class InstitutionInvitations1755900000000 implements MigrationInterface {
  name = 'InstitutionInvitations1755900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "institution_invitations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "institutionId" uuid NOT NULL,
        "email" character varying(320) NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "invitedById" uuid,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "acceptedAt" TIMESTAMP WITH TIME ZONE,
        "acceptedByUserId" uuid,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_institution_invitations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "institution_invitations"
      ADD CONSTRAINT "FK_institution_invitations_institution"
      FOREIGN KEY ("institutionId") REFERENCES "institutions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // The inviter and the accepter are attribution, not structure: deleting either
    // account must not take the record of the invitation with it.
    await queryRunner.query(`
      ALTER TABLE "institution_invitations"
      ADD CONSTRAINT "FK_institution_invitations_invitedBy"
      FOREIGN KEY ("invitedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "institution_invitations"
      ADD CONSTRAINT "FK_institution_invitations_acceptedBy"
      FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_institution_invitations_tokenHash"
      ON "institution_invitations" ("tokenHash")
    `);

    // Lowercased in the index as well as in the service, so two spellings of the
    // same mailbox cannot both be outstanding.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_institution_invitations_open"
      ON "institution_invitations" ("institutionId", LOWER("email"))
      WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_institution_invitations_open"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_institution_invitations_tokenHash"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "institution_invitations"`);
  }
}
