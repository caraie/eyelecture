import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'el-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="el-card">
      <div class="el-empty">
        <div class="ico"><mat-icon>lock</mat-icon></div>
        <h4>You do not have access to this page</h4>
        <p>
          Your role does not cover this area. If you think it should, ask an
          administrator to check your account.
        </p>
        <a mat-flat-button color="primary" routerLink="/app/dashboard">
          Back to the dashboard
        </a>
      </div>
    </div>
  `,
})
export class ForbiddenComponent {}
