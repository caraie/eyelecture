import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  QuizAvailability,
  QuizQuestion,
  SaveQuestion,
} from '../models/lecture.model';

/**
 * The quiz as its author writes it. Every call here returns the questions with
 * the right answers marked, so the API only answers them for someone who may
 * edit the lecture — taking the quiz is a different set of endpoints.
 */
@Injectable({ providedIn: 'root' })
export class QuizzesService {
  private readonly http = inject(HttpClient);

  private url(lectureId: string): string {
    return `${environment.apiUrl}/lectures/${lectureId}/quiz`;
  }

  list(lectureId: string): Observable<QuizQuestion[]> {
    return this.http.get<QuizQuestion[]>(`${this.url(lectureId)}/questions`);
  }

  create(lectureId: string, question: SaveQuestion): Observable<QuizQuestion> {
    return this.http.post<QuizQuestion>(
      `${this.url(lectureId)}/questions`,
      question,
    );
  }

  update(
    lectureId: string,
    questionId: string,
    question: SaveQuestion,
  ): Observable<QuizQuestion> {
    return this.http.patch<QuizQuestion>(
      `${this.url(lectureId)}/questions/${questionId}`,
      question,
    );
  }

  remove(lectureId: string, questionId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.url(lectureId)}/questions/${questionId}`,
    );
  }

  /** The whole list in its new order — the server refuses a partial one. */
  reorder(lectureId: string, ids: string[]): Observable<QuizQuestion[]> {
    return this.http.patch<QuizQuestion[]>(
      `${this.url(lectureId)}/questions/order`,
      { ids },
    );
  }

  setAvailability(
    lectureId: string,
    availability: QuizAvailability,
  ): Observable<{ availability: QuizAvailability }> {
    return this.http.patch<{ availability: QuizAvailability }>(
      `${this.url(lectureId)}/availability`,
      { availability },
    );
  }
}
