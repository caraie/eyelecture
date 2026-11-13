import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LectureProgress,
  QuizAttempt,
  QuizAttemptSummary,
  QuizPhase,
} from '../models/lecture.model';

/**
 * Taking a quiz and looking back at the ones you have taken.
 *
 * Everything here is about the signed-in learner's own attempts; there is no
 * call that reads anybody else's.
 */
@Injectable({ providedIn: 'root' })
export class QuizAttemptsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Starts a sitting. The server decides whether it counts as pre or post. */
  start(lectureId: string): Observable<QuizAttempt> {
    return this.http.post<QuizAttempt>(
      `${this.api}/lectures/${lectureId}/quiz/attempts`,
      {},
    );
  }

  /** The sitting they walked away from, if there is one. */
  open(lectureId: string): Observable<QuizAttempt | null> {
    return this.http.get<QuizAttempt | null>(
      `${this.api}/lectures/${lectureId}/quiz/attempts/open`,
    );
  }

  answer(
    attemptId: string,
    sortOrder: number,
    chosenIndex: number | null,
  ): Observable<QuizAttempt> {
    return this.http.patch<QuizAttempt>(
      `${this.api}/quiz-attempts/${attemptId}/answer`,
      { sortOrder, chosenIndex },
    );
  }

  submit(attemptId: string): Observable<QuizAttempt> {
    return this.http.post<QuizAttempt>(
      `${this.api}/quiz-attempts/${attemptId}/submit`,
      {},
    );
  }

  discard(attemptId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/quiz-attempts/${attemptId}`);
  }

  review(attemptId: string): Observable<QuizAttempt> {
    return this.http.get<QuizAttempt>(`${this.api}/quiz-attempts/${attemptId}`);
  }

  history(
    filterBy: { lectureId?: string; phase?: QuizPhase } = {},
  ): Observable<QuizAttemptSummary[]> {
    const params: Record<string, string> = {};
    if (filterBy.lectureId) params['lectureId'] = filterBy.lectureId;
    if (filterBy.phase) params['phase'] = filterBy.phase;

    return this.http.get<QuizAttemptSummary[]>(`${this.api}/me/quiz-attempts`, {
      params,
    });
  }

  markStarted(lectureId: string): Observable<LectureProgress> {
    return this.http.post<LectureProgress>(
      `${this.api}/lectures/${lectureId}/progress/started`,
      {},
    );
  }

  markCompleted(lectureId: string): Observable<LectureProgress> {
    return this.http.post<LectureProgress>(
      `${this.api}/lectures/${lectureId}/progress/completed`,
      {},
    );
  }
}
