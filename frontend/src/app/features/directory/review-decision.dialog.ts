import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { User } from '../../core/models/user.model';
import { Institution } from '../../core/models/institution.model';

export interface ReviewDialogData {
  mode: 'approve' | 'reject';
  user: User;
  institutions: Institution[];
  /** True when the API will refuse without an explicit institution. */
  requireInstitution: boolean;
}

export interface ReviewDialogResult {
  institutionId?: string;
  note?: string;
}

@Component({
  selector: 'el-review-decision-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.mode === 'approve' ? 'Validate' : 'Turn down' }} {{ data.user.fullName }}
    </h2>

    <mat-dialog-content>
      <p class="lede">
        @if (data.mode === 'approve') {
          They will get full access to their institution's material.
        } @else {
          They keep their account but stay outside the institution. The reason below
          is shown to them.
        }
      </p>

      <div class="who">
        <div class="row">
          <span class="k">Email</span>
          <span class="v">{{ data.user.email }}</span>
        </div>
        @if (data.user.requestedInstitution) {
          <div class="row">
            <span class="k">Asked to join</span>
            <span class="v">{{ data.user.requestedInstitution.name }}</span>
          </div>
        }
        @if (data.user.institution) {
          <div class="row">
            <span class="k">Institution</span>
            <span class="v">{{ data.user.institution.name }}</span>
          </div>
        }
      </div>

      @if (data.mode === 'approve' && data.requireInstitution) {
        <mat-form-field appearance="outline">
          <mat-label>Institution</mat-label>
          <mat-select [(ngModel)]="institutionId">
            @for (institution of data.institutions; track institution.id) {
              <mat-option [value]="institution.id">{{ institution.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>This signup is not linked to any institution yet.</mat-hint>
        </mat-form-field>
      }

      <mat-form-field appearance="outline">
        <mat-label>
          {{ data.mode === 'approve' ? 'Note (optional)' : 'Reason (optional)' }}
        </mat-label>
        <textarea
          matInput
          rows="3"
          [(ngModel)]="note"
          [placeholder]="
            data.mode === 'approve'
              ? 'e.g. Confirmed on the 2026 class roster'
              : 'e.g. Not enrolled in this program'
          "
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button
        mat-flat-button
        type="button"
        [color]="data.mode === 'approve' ? 'primary' : 'warn'"
        [disabled]="data.mode === 'approve' && data.requireInstitution && !institutionId()"
        (click)="confirm()"
      >
        {{ data.mode === 'approve' ? 'Validate' : 'Turn down' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .lede {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;
        line-height: 1.55;
        margin-bottom: var(--sp-4);
      }

      .who {
        background: var(--md-sys-color-surface-container);
        border-radius: var(--md-sys-shape-corner-md);
        padding: var(--sp-3) var(--sp-4);
        margin-bottom: var(--sp-5);
      }

      .who .row {
        display: flex;
        justify-content: space-between;
        gap: var(--sp-4);
        padding: 4px 0;
        font-size: 13px;
      }

      .who .k {
        color: var(--md-sys-color-on-surface-muted);
        flex: none;
      }

      .who .v {
        text-align: right;
        overflow-wrap: anywhere;
      }

      mat-form-field {
        width: 100%;
      }
    `,
  ],
})
export class ReviewDecisionDialog {
  readonly dialogRef = inject(MatDialogRef<ReviewDecisionDialog>);
  readonly data = inject<ReviewDialogData>(MAT_DIALOG_DATA);

  readonly institutionId = signal('');
  readonly note = signal('');

  confirm(): void {
    this.dialogRef.close({
      institutionId: this.institutionId() || undefined,
      note: this.note().trim() || undefined,
    } satisfies ReviewDialogResult);
  }
}
