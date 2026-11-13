import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Taking a quiz: how far a learner has got with a lecture, and every sitting.
 *
 * `quiz_attempt_answers` copies the question rather than pointing at it. An
 * author may rewrite or delete a question the day after a learner sat the
 * quiz; if the history referred to the live question it would change
 * underneath them and a past score would stop adding up. `questionId` is kept
 * alongside the copy, nullable, only so the same question can be lined up
 * across a learner's pre- and post-lecture attempts.
 *
 * Attempts cascade from both the lecture and the learner. A score on a lecture
 * nobody can open is of no use, and a deleted account takes its own history.
 */
export class QuizAttempts1756300000000 implements MigrationInterface {
  name = 'QuizAttempts1756300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "quiz_phase_enum" AS ENUM ('pre', 'post')`,
    );

    await queryRunner.query(`
      CREATE TABLE "lecture_progress" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "lectureId" uuid NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_progress" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quiz_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "lectureId" uuid NOT NULL,
        "phase" "quiz_phase_enum" NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "submittedAt" TIMESTAMP WITH TIME ZONE,
        "score" integer NOT NULL DEFAULT 0,
        "total" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quiz_attempts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quiz_attempt_answers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "attemptId" uuid NOT NULL,
        "questionId" uuid,
        "sortOrder" integer NOT NULL,
        "prompt" text NOT NULL,
        "explanation" text,
        "options" jsonb NOT NULL,
        "chosenIndex" integer,
        CONSTRAINT "PK_quiz_attempt_answers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "lecture_progress"
      ADD CONSTRAINT "FK_lecture_progress_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lecture_progress"
      ADD CONSTRAINT "FK_lecture_progress_lecture"
      FOREIGN KEY ("lectureId") REFERENCES "lectures"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "quiz_attempts"
      ADD CONSTRAINT "FK_quiz_attempts_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "quiz_attempts"
      ADD CONSTRAINT "FK_quiz_attempts_lecture"
      FOREIGN KEY ("lectureId") REFERENCES "lectures"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "quiz_attempt_answers"
      ADD CONSTRAINT "FK_quiz_attempt_answers_attempt"
      FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_lecture_progress_user_lecture"
      ON "lecture_progress" ("userId", "lectureId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_quiz_attempts_user"
      ON "quiz_attempts" ("userId", "startedAt")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_quiz_attempts_lecture" ON "quiz_attempts" ("lectureId")`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_quiz_attempt_answers_attempt"
      ON "quiz_attempt_answers" ("attemptId", "sortOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_quiz_attempt_answers_attempt"`);
    await queryRunner.query(`DROP INDEX "IDX_quiz_attempts_lecture"`);
    await queryRunner.query(`DROP INDEX "IDX_quiz_attempts_user"`);
    await queryRunner.query(`DROP INDEX "IDX_lecture_progress_user_lecture"`);
    await queryRunner.query(`DROP TABLE "quiz_attempt_answers"`);
    await queryRunner.query(`DROP TABLE "quiz_attempts"`);
    await queryRunner.query(`DROP TABLE "lecture_progress"`);
    await queryRunner.query(`DROP TYPE "quiz_phase_enum"`);
  }
}
