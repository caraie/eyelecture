import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EyeLogoComponent } from '../../shared/components/eye-logo.component';

@Component({
  selector: 'el-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, EyeLogoComponent],
  template: `
    <div class="wrap">
      <el-eye-logo [size]="44" />
      <h1 class="el-display">404</h1>
      <p class="el-lede">
        Nothing lives at this address. It may have moved, or the link may be wrong.
      </p>
      <a mat-flat-button color="primary" routerLink="/app/dashboard">
        Go to the dashboard
      </a>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--sp-4);
        text-align: center;
        padding: var(--sp-6);
      }

      .el-lede {
        max-width: 44ch;
      }
    `,
  ],
})
export class NotFoundComponent {}
