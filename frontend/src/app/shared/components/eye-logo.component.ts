import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The brandmark: the eye alone — no container, no plate. The almond is the
 * primary colour, the iris carries the secondary. Taken verbatim from the
 * design system so the two never drift.
 */
@Component({
  selector: 'el-eye-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="eyemark"
      viewBox="0 0 32 32"
      [style.width.px]="size()"
      [style.height.px]="size()"
      aria-hidden="true"
    >
      <path
        class="lid"
        d="M2.6 16C6.2 10 10.9 7 16 7s9.8 3 13.4 9c-3.6 6-8.3 9-13.4 9S6.2 22 2.6 16Z"
      />
      <circle class="iris" cx="16" cy="16" r="5.4" />
      <circle class="pupil" cx="16" cy="16" r="2.4" />
      <circle class="spark" cx="18.1" cy="13.6" r="1.15" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
      }
      .eyemark {
        flex: none;
        display: block;
      }
      .lid {
        fill: none;
        stroke: var(--logo-stroke, var(--md-sys-color-primary));
        stroke-width: 2.1;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .iris {
        fill: var(--logo-iris, var(--md-sys-color-secondary));
      }
      .pupil {
        fill: var(--logo-pupil, var(--md-sys-color-primary));
      }
      .spark {
        fill: #fff;
        opacity: 0.9;
      }
    `,
  ],
})
export class EyeLogoComponent {
  readonly size = input(30);
}
