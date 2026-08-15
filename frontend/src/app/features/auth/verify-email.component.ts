import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

type VerifyState = 'working' | 'done' | 'failed' | 'missing';

@Component({
  selector: 'el-verify-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './verify-email.component.html',
  styleUrl: './auth-forms.scss',
})
export class VerifyEmailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  readonly state = signal<VerifyState>('working');
  readonly message = signal('');

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.state.set('missing');
      return;
    }

    // Verification signs the user in, so we land them straight in the app.
    this.auth.verifyEmail(token).subscribe({
      next: () => {
        this.state.set('done');
        setTimeout(() => void this.router.navigateByUrl('/app/dashboard'), 1400);
      },
      error: (error: unknown) => {
        this.state.set('failed');
        this.message.set(
          this.notify.fromHttpError(error, 'This link is no longer valid'),
        );
      },
    });
  }
}
