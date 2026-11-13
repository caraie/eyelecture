import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LectureProgress } from './entities/lecture-progress.entity';
import { User } from '../users/entities/user.entity';

/**
 * How far each learner has got with each lecture.
 *
 * Small on purpose: it answers "has this person finished that lecture?", which
 * the cards show and which decides whether a quiz attempt is a pre- or a
 * post-lecture one.
 */
@Injectable()
export class LectureProgressService {
  constructor(
    @InjectRepository(LectureProgress)
    private readonly progress: Repository<LectureProgress>,
  ) {}

  /** Opening a lecture. Idempotent — the start time is never moved. */
  async start(lectureId: string, learner: User): Promise<LectureProgress> {
    const existing = await this.find(lectureId, learner.id);
    if (existing) return existing;

    return this.progress.save(
      this.progress.create({
        lectureId,
        userId: learner.id,
        startedAt: new Date(),
        completedAt: null,
      }),
    );
  }

  /**
   * Finishing it. Also idempotent: saying "done" twice keeps the first time,
   * because that is the moment a later attempt is measured against.
   */
  async complete(lectureId: string, learner: User): Promise<LectureProgress> {
    const row = await this.start(lectureId, learner);
    if (row.completedAt) return row;

    row.completedAt = new Date();
    return this.progress.save(row);
  }

  async hasCompleted(lectureId: string, learner: User): Promise<boolean> {
    const row = await this.find(lectureId, learner.id);
    return row?.completedAt !== null && row?.completedAt !== undefined;
  }

  /** For a list of lectures at once, so a screen does not ask one by one. */
  async forLectures(
    lectureIds: string[],
    learner: User,
  ): Promise<Map<string, LectureProgress>> {
    if (!lectureIds.length) return new Map();

    const rows = await this.progress.find({
      where: { userId: learner.id, lectureId: In(lectureIds) },
    });
    return new Map(rows.map((row) => [row.lectureId, row]));
  }

  private async find(
    lectureId: string,
    userId: string,
  ): Promise<LectureProgress | null> {
    return this.progress.findOne({ where: { lectureId, userId } });
  }
}
