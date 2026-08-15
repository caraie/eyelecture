import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EyeLogoComponent } from '../../shared/components/eye-logo.component';

/**
 * Split layout for the signed-out screens: brand panel on the left, the actual
 * form on the right. The panel collapses away below 900px.
 */
@Component({
  selector: 'el-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EyeLogoComponent],
  template: `
    <div class="el-auth">
      <aside class="el-auth-aside">
        <div class="brand">
          <el-eye-logo [size]="40" />
          <span>EyeLecture</span>
        </div>

        <h1 class="el-display">
          Lectures that <span class="el-hl">look back</span> at the room.
        </h1>

        <p class="lede">
          Question-level analytics, cohort comparison and transcripts — for the people
          who teach and the people who study.
        </p>

        <ul class="points">
          <li>
            <span class="dot"></span>
            Institution email domains validate students automatically
          </li>
          <li>
            <span class="dot"></span>
            Program directors vouch for everyone else
          </li>
          <li>
            <span class="dot"></span>
            Records stay auditable end to end
          </li>
        </ul>
      </aside>

      <div class="el-auth-main">
        <div class="el-auth-card">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 22px;
        letter-spacing: -0.03em;
        margin-bottom: var(--sp-12);
        --logo-stroke: #fff;
        --logo-iris: #a8e8cb;
        --logo-pupil: #ffffff;
      }

      .el-display {
        max-width: 14ch;
        margin-bottom: var(--sp-5);
      }

      .lede {
        font-size: 16px;
        line-height: 1.62;
        max-width: 44ch;
        opacity: 0.9;
        margin-bottom: var(--sp-10);
      }

      .points {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        font-size: 14.5px;
      }

      .points li {
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0.92;
      }

      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #a8e8cb;
        flex: none;
      }
    `,
  ],
})
export class AuthLayoutComponent {}
