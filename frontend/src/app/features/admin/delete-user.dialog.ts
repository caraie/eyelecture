import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { User } from '../../core/models/user.model';

/**
 * Confirms deleting an account.
 *
 * A dialog rather than the two-step inline confirmation the administrators screen
 * uses. That pattern is better where it fits — the row stays visible and answers the
 * question itself — but this table scrolls horizontally and its actions column is one
 * icon wide, so an inline confirmation lands off the right edge and the buttons
 * cannot be reached. Repeating the name and address here recovers what the inline
 * version got for free: certainty about who is being deleted.
 */
@Component({
  selector: 'el-delete-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete {{ data.fullName }}?</h2>

    <mat-dialog-content>
      <p class="lede">
        This cannot be undone. Their sessions end immediately and any pending
        verification link stops working. If you only want to block them from signing
        in, close this and use <strong>Suspend</strong> instead — that is reversible.
      </p>

      <div class="who">
        <div class="row">
          <span class="k">Email</span>
          <span class="v">{{ data.email }}</span>
        </div>
        @if (data.institution) {
          <div class="row">
            <span class="k">Institution</span>
            <span class="v">{{ data.institution.name }}</span>
          </div>
        }
      </div>

      <p class="fine">
        People they validated keep their membership — only the record of who approved
        them is lost.
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Keep account</button>
      <button
        mat-flat-button
        type="button"
        class="danger-filled"
        (click)="dialogRef.close(true)"
      >
        Delete permanently
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
        margin-bottom: var(--sp-4);
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

      .fine {
        color: var(--md-sys-color-on-surface-muted);
        font-size: 13px;
        line-height: 1.55;
        margin: 0;
      }

      .danger-filled {
        --mdc-filled-button-container-color: var(--md-sys-color-error);
        --mdc-filled-button-label-text-color: var(--md-sys-color-on-error);
      }
    `,
  ],
})
export class DeleteUserDialog {
  readonly dialogRef = inject(MatDialogRef<DeleteUserDialog, true | undefined>);
  readonly data = inject<User>(MAT_DIALOG_DATA);
}
