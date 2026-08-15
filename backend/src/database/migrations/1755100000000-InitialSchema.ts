import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: institutions, their email domains, users, and the auth tokens.
 *
 * `vector` is enabled up front so that adding embedding columns later (lecture
 * transcripts, question similarity) is a plain ALTER TABLE rather than a migration
 * that needs superuser rights on a database that is already carrying data.
 */
export class InitialSchema1755100000000 implements MigrationInterface {
  name = 'InitialSchema1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('admin', 'program_director', 'student')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM (
        'pending_email_verification', 'active', 'suspended'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "users_validationstatus_enum" AS ENUM ('pending', 'validated', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_validationmethod_enum" AS ENUM ('email_domain', 'manual')
    `);

    await queryRunner.query(`
      CREATE TABLE "institutions" (
        "id"          uuid          NOT NULL DEFAULT gen_random_uuid(),
        "name"        varchar(200)  NOT NULL,
        "slug"        varchar(120)  NOT NULL,
        "description" varchar(500),
        "logoUrl"     varchar(500),
        "isActive"    boolean       NOT NULL DEFAULT true,
        "createdAt"   timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_institutions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_institutions_slug" ON "institutions" ("slug")`,
    );

    await queryRunner.query(`
      CREATE TABLE "institution_domains" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "domain"        varchar(253) NOT NULL,
        "institutionId" uuid         NOT NULL,
        "createdAt"     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_institution_domains" PRIMARY KEY ("id"),
        CONSTRAINT "FK_institution_domains_institution"
          FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_institution_domains_domain" ON "institution_domains" ("domain")`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                     uuid   NOT NULL DEFAULT gen_random_uuid(),
        "email"                  varchar(320) NOT NULL,
        "emailDomain"            varchar(253) NOT NULL,
        "passwordHash"           varchar      NOT NULL,
        "firstName"              varchar(100) NOT NULL,
        "lastName"               varchar(100) NOT NULL,
        "role"                   "users_role_enum"   NOT NULL DEFAULT 'student',
        "status"                 "users_status_enum" NOT NULL DEFAULT 'pending_email_verification',
        "emailVerifiedAt"        timestamptz,
        "institutionId"          uuid,
        "validationStatus"       "users_validationstatus_enum" NOT NULL DEFAULT 'pending',
        "validationMethod"       "users_validationmethod_enum",
        "validatedAt"            timestamptz,
        "validatedById"          uuid,
        "validationNote"         varchar(500),
        "requestedInstitutionId" uuid,
        "createdAt"              timestamptz NOT NULL DEFAULT now(),
        "updatedAt"              timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_institution"
          FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_users_requested_institution"
          FOREIGN KEY ("requestedInstitutionId") REFERENCES "institutions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_users_validated_by"
          FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_emailDomain" ON "users" ("emailDomain")`,
    );
    // Backs the program director's review queue.
    await queryRunner.query(`
      CREATE INDEX "IDX_users_validation_queue"
        ON "users" ("validationStatus", "institutionId", "requestedInstitutionId")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"        uuid        NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash" varchar(64) NOT NULL,
        "userId"    uuid        NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "userAgent" varchar(255),
        "ipAddress" varchar(64),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`,
    );

    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash"  varchar(64) NOT NULL,
        "userId"     uuid        NOT NULL,
        "expiresAt"  timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_tokens_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_verification_tokens_tokenHash"
        ON "email_verification_tokens" ("tokenHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verification_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "institution_domains"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "institutions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_validationmethod_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_validationstatus_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
