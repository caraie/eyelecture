import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The quiz on a lecture: one set of questions, each with its options.
 *
 * One set per lecture, taken before the lecture and again after it. That is
 * what makes the two scores comparable, which is the only reason to ask the
 * same questions twice.
 *
 * `quizAvailability` lives on `lectures` rather than on the questions: it is a
 * property of the quiz as a whole, and the quiz is not its own table — a
 * lecture with no questions simply has no quiz, which is how the screens
 * decide whether to offer one.
 *
 * Both tables cascade from their parent. Questions are parts of a lecture and
 * options are parts of a question; neither means anything on its own. Past
 * attempts are not affected, because an attempt keeps its own snapshot of what
 * was asked — see the EYE-4 migration.
 */
export class LectureQuizzes1756200000000 implements MigrationInterface {
  name = 'LectureQuizzes1756200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "quiz_availability_enum" AS ENUM ('pre', 'post', 'both')`,
    );
    await queryRunner.query(`
      ALTER TABLE "lectures"
      ADD COLUMN "quizAvailability" "quiz_availability_enum" NOT NULL DEFAULT 'both'
    `);

    await queryRunner.query(`
      CREATE TABLE "lecture_quiz_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lectureId" uuid NOT NULL,
        "prompt" text NOT NULL,
        "explanation" text,
        "imageObjectKey" character varying(500),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lecture_quiz_questions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "lecture_quiz_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "questionId" uuid NOT NULL,
        "text" text NOT NULL,
        "isCorrect" boolean NOT NULL DEFAULT false,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_lecture_quiz_options" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "lecture_quiz_questions"
      ADD CONSTRAINT "FK_quiz_questions_lecture"
      FOREIGN KEY ("lectureId") REFERENCES "lectures"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lecture_quiz_options"
      ADD CONSTRAINT "FK_quiz_options_question"
      FOREIGN KEY ("questionId") REFERENCES "lecture_quiz_questions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_quiz_questions_lecture" ON "lecture_quiz_questions" ("lectureId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quiz_options_question" ON "lecture_quiz_options" ("questionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_quiz_options_question"`);
    await queryRunner.query(`DROP INDEX "IDX_quiz_questions_lecture"`);
    await queryRunner.query(
      `ALTER TABLE "lecture_quiz_options" DROP CONSTRAINT "FK_quiz_options_question"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lecture_quiz_questions" DROP CONSTRAINT "FK_quiz_questions_lecture"`,
    );
    await queryRunner.query(`DROP TABLE "lecture_quiz_options"`);
    await queryRunner.query(`DROP TABLE "lecture_quiz_questions"`);
    await queryRunner.query(`ALTER TABLE "lectures" DROP COLUMN "quizAvailability"`);
    await queryRunner.query(`DROP TYPE "quiz_availability_enum"`);
  }
}
