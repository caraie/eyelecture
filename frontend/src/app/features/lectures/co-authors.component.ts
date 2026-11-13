import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CoAuthorsService } from '../../core/services/co-authors.service';
import { NotificationService } from '../../core/services/notification.service';
import { CoAuthor, Person } from '../../core/models/lecture.model';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Crediting other people on a lecture.
 *
 * The old app's dead end was searching for somebody who is not registered and
 * being told "No Results" with nowhere to go. Here the same empty search is
 * what offers to write to them, so the flow carries on instead of stopping.
 */
@Component({
  selector: 'el-co-authors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './co-authors.component.html',
  styleUrl: './co-authors.component.scss',
})
export class CoAuthorsComponent {
  private readonly api = inject(CoAuthorsService);
  private readonly notify = inject(NotificationService);

  readonly lectureId = input.required<string>();
  readonly authorName = input<string | null>(null);
  readonly initial = input<CoAuthor[]>([]);

  readonly coAuthors = signal<CoAuthor[]>([]);
  readonly picking = signal(false);
  readonly searching = signal(false);
  readonly busy = signal(false);

  readonly term = signal('');
  readonly results = signal<Person[]>([]);
  /** The invitation form, opened from an empty search. */
  readonly inviteEmail = signal('');
  readonly inviteName = signal('');
  readonly inviting = signal(false);

  private readonly typed = new Subject<string>();

  readonly searched = computed(() => this.term().trim().length >= 2);
  readonly nothingFound = computed(
    () => this.searched() && !this.searching() && this.results().length === 0,
  );
  readonly emailLooksRight = computed(() => EMAIL.test(this.inviteEmail().trim()));

  constructor() {
    effect(() => this.coAuthors.set(this.initial()));

    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.searching.set(true);
          return this.api.search(this.lectureId(), term);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (people) => {
          this.searching.set(false);
          this.results.set(people);
        },
        error: (error: unknown) => {
          this.searching.set(false);
          this.notify.showHttpError(error, 'Could not search for people');
        },
      });
  }

  open(): void {
    this.picking.set(true);
    this.reset();
  }

  close(): void {
    this.picking.set(false);
    this.reset();
  }

  private reset(): void {
    this.term.set('');
    this.results.set([]);
    this.inviting.set(false);
    this.inviteEmail.set('');
    this.inviteName.set('');
  }

  search(term: string): void {
    this.term.set(term);
    if (term.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.typed.next(term.trim());
  }

  add(person: Person): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.api.add(this.lectureId(), person.id).subscribe({
      next: (rows) => {
        this.busy.set(false);
        this.coAuthors.set(rows);
        this.notify.success(`${person.name} credited`);
        this.close();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify.showHttpError(error, 'Could not add them');
      },
    });
  }

  /** Pre-fills the address when what they typed already looks like one. */
  startInvite(): void {
    this.inviting.set(true);
    if (EMAIL.test(this.term().trim())) this.inviteEmail.set(this.term().trim());
  }

  invite(): void {
    if (!this.emailLooksRight() || this.busy()) return;

    const email = this.inviteEmail().trim();
    this.busy.set(true);
    this.api
      .invite(this.lectureId(), email, this.inviteName().trim() || undefined)
      .subscribe({
        next: (rows) => {
          this.busy.set(false);
          // Credited outright rather than written to, when the address turned
          // out to belong to an account already.
          const added = rows.find(
            (row) => !this.coAuthors().some((had) => had.id === row.id),
          );
          this.coAuthors.set(rows);
          this.notify.success(
            added && !added.invited
              ? `${added.name} was already here — credited`
              : `Invitation sent to ${email}`,
          );
          this.close();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notify.showHttpError(error, 'Could not send that invitation');
        },
      });
  }

  resend(coAuthor: CoAuthor): void {
    this.api.resend(this.lectureId(), coAuthor.id).subscribe({
      next: (rows) => {
        this.coAuthors.set(rows);
        this.notify.success('Invitation sent again');
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not send it again'),
    });
  }

  remove(coAuthor: CoAuthor): void {
    this.api.remove(this.lectureId(), coAuthor.id).subscribe({
      next: (rows) => {
        this.coAuthors.set(rows);
        this.notify.info(
          coAuthor.invited ? 'Invitation withdrawn' : `${coAuthor.name} removed`,
        );
      },
      error: (error: unknown) =>
        this.notify.showHttpError(error, 'Could not remove them'),
    });
  }
}
