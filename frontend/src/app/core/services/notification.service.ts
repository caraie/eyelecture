import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 4000,
      panelClass: 'el-snack-success',
    });
  }

  info(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }

  error(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 7000,
      panelClass: 'el-snack-error',
    });
  }

  /**
   * Turns a NestJS error body into something worth showing. class-validator
   * returns `message` as an array of strings, which would otherwise render as
   * "[object Object]" or a comma soup.
   */
  fromHttpError(error: unknown, fallback = 'Something went wrong'): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;

    if (error.status === 0) {
      return 'Cannot reach the server. Is the API running?';
    }

    const body = error.error as { message?: string | string[] } | null;
    const message = body?.message;

    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
    return fallback;
  }

  showHttpError(error: unknown, fallback?: string): void {
    this.error(this.fromHttpError(error, fallback));
  }
}
