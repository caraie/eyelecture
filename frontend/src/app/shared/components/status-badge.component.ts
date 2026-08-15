import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  User,
  VALIDATION_LABELS,
  ValidationStatus,
} from '../../core/models/user.model';

interface BadgeSpec {
  cls: string;
  icon: string;
  label: string;
  title: string;
}

/**
 * One badge that answers "is this person confirmed to belong here, and how do
 * we know?". Distinguishing automatic from manual matters to a reviewer: an
 * email-domain match is evidence, a manual approval is somebody's judgement.
 */
@Component({
  selector: 'el-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <span class="el-badge {{ spec().cls }}" [title]="spec().title">
      <mat-icon>{{ spec().icon }}</mat-icon>
      {{ spec().label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly user = input.required<User>();

  readonly spec = computed<BadgeSpec>(() => {
    const user = this.user();
    const status: ValidationStatus = user.validationStatus;

    if (status === 'validated') {
      const auto = user.validationMethod === 'email_domain';
      return {
        cls: 'el-badge-success',
        icon: auto ? 'verified' : 'how_to_reg',
        label: auto ? 'Verified by domain' : 'Validated',
        title: auto
          ? `Auto-validated: the address is on a domain owned by ${user.institution?.name ?? 'their institution'}.`
          : 'Approved by a program director or administrator.',
      };
    }

    if (status === 'rejected') {
      return {
        cls: 'el-badge-error',
        icon: 'block',
        label: 'Rejected',
        title: user.validationNote ?? 'This membership request was turned down.',
      };
    }

    return {
      cls: 'el-badge-warning',
      icon: 'schedule',
      label: VALIDATION_LABELS.pending,
      title: 'Waiting for a program director or administrator to confirm membership.',
    };
  });
}
