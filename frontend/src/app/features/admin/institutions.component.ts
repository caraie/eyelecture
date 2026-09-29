import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { InstitutionsService } from '../../core/services/institutions.service';
import { NotificationService } from '../../core/services/notification.service';
import { DatePipe } from '@angular/common';
import {
  INVITATION_STATE_LABELS,
  Institution,
  Invitation,
  InvitationState,
} from '../../core/models/institution.model';

/** Strips a leading @ and lowercases, mirroring what the API stores. */
const normalizeDomain = (value: string): string =>
  value.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');

@Component({
  selector: 'el-institutions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatExpansionModule,
  ],
  templateUrl: './institutions.component.html',
  styleUrl: './institutions.component.scss',
})
export class InstitutionsComponent {
  private readonly api = inject(InstitutionsService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly institutions = signal<Institution[]>([]);
  readonly showCreate = signal(false);

  /**
   * Filtered in the browser rather than on the server. The whole list is already
   * loaded in one request, so a round trip per keystroke would make it slower, not
   * faster. When this list outgrows a single page the filter moves to the API and
   * this signal becomes the query parameter.
   */
  readonly filter = signal('');
  readonly visibleInstitutions = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (!needle) return this.institutions();
    return this.institutions().filter(
      (institution) =>
        institution.name.toLowerCase().includes(needle) ||
        institution.slug.toLowerCase().includes(needle) ||
        institution.domains.some(({ domain }) =>
          domain.toLowerCase().includes(needle),
        ),
    );
  });
  /** Per-institution scratch value for the "add a domain" input. */
  readonly domainDrafts = signal<Record<string, string>>({});
  readonly inviteDrafts = signal<Record<string, string>>({});
  readonly busyId = signal<string | null>(null);

  /**
   * Which rows are open. A set rather than a single id: comparing two institutions
   * is a normal thing to want, and an accordion that closes the one you were reading
   * is the kind of helpfulness nobody asked for.
   */
  readonly openIds = signal<Set<string>>(new Set());

  /**
   * Invitations are fetched per institution, the first time its row is opened, and
   * kept afterwards. Loading them with the list would mean a query per institution
   * on every page load to fill in a panel almost nobody opens.
   */
  readonly invitations = signal<Record<string, Invitation[]>>({});
  readonly invitationsLoading = signal<Set<string>>(new Set());

  readonly stateLabels = INVITATION_STATE_LABELS;
  readonly stateIcons: Record<InvitationState, string> = {
    pending: 'schedule',
    accepted: 'how_to_reg',
    revoked: 'undo',
    expired: 'hourglass_disabled',
  };

  readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    domains: [''],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (list) => {
        this.institutions.set(list);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.notify.showHttpError(error, 'Could not load institutions');
      },
    });
  }

  toggleCreate(): void {
    this.showCreate.update((open) => !open);
    if (!this.showCreate()) this.createForm.reset();
  }

  create(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    // Accept "@a.edu, b.edu" or one per line — people paste both.
    const domains = raw.domains
      .split(/[\s,;]+/)
      .map(normalizeDomain)
      .filter(Boolean);

    this.saving.set(true);
    this.api
      .create({
        name: raw.name.trim(),
        ...(raw.description.trim() ? { description: raw.description.trim() } : {}),
        ...(domains.length ? { domains } : {}),
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.institutions.update((list) =>
            [...list, created].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.createForm.reset();
          this.showCreate.set(false);
          this.notify.success(`${created.name} added`);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notify.showHttpError(error, 'Could not create the institution');
        },
      });
  }

  // --- Opening a row ------------------------------------------------------------

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  toggleOpen(id: string): void {
    this.openIds.update((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Fetched once, on first open, and kept. Re-fetching every time would make a
    // row you are toggling to re-read flicker for no new information.
    if (this.isOpen(id) && !(id in this.invitations())) {
      this.loadInvitations(id);
    }
  }

  draftFor(id: string): string {
    return this.domainDrafts()[id] ?? '';
  }

  setDraft(id: string, value: string): void {
    this.domainDrafts.update((drafts) => ({ ...drafts, [id]: value }));
  }

  // --- Invitations --------------------------------------------------------------

  invitationsFor(id: string): Invitation[] {
    return this.invitations()[id] ?? [];
  }

  inviteDraftFor(id: string): string {
    return this.inviteDrafts()[id] ?? '';
  }

  setInviteDraft(id: string, value: string): void {
    this.inviteDrafts.update((drafts) => ({ ...drafts, [id]: value }));
  }

  private loadInvitations(id: string): void {
    this.invitationsLoading.update((set) => new Set(set).add(id));
    this.api.invitations(id).subscribe({
      next: (list) => {
        this.invitations.update((all) => ({ ...all, [id]: list }));
        this.clearInvitationsLoading(id);
      },
      error: (error: unknown) => {
        // An empty list rather than nothing, so the invite form still appears and
        // the panel does not look broken.
        this.invitations.update((all) => ({ ...all, [id]: [] }));
        this.clearInvitationsLoading(id);
        this.notify.showHttpError(error, 'Could not load the invitations');
      },
    });
  }

  invite(institution: Institution): void {
    const email = this.inviteDraftFor(institution.id).trim().toLowerCase();
    if (!email) return;

    this.busyId.set(institution.id);
    this.api.invite(institution.id, email).subscribe({
      next: (invitation) => {
        this.invitations.update((all) => ({
          ...all,
          [institution.id]: [invitation, ...this.invitationsFor(institution.id)],
        }));
        this.setInviteDraft(institution.id, '');
        this.busyId.set(null);
        this.notify.success(
          invitation.devLink
            ? `Invitation created for ${email} — mail is off, so use the link`
            : `Invitation sent to ${email}`,
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not send that invitation');
      },
    });
  }

  revokeInvitation(institution: Institution, invitation: Invitation): void {
    this.busyId.set(institution.id);
    this.api.revokeInvitation(institution.id, invitation.id).subscribe({
      next: (updated) => {
        this.invitations.update((all) => ({
          ...all,
          [institution.id]: this.invitationsFor(institution.id).map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
        this.busyId.set(null);
        this.notify.info(`${invitation.email}'s link no longer works`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not withdraw that invitation');
      },
    });
  }

  private clearInvitationsLoading(id: string): void {
    this.invitationsLoading.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  addDomain(institution: Institution): void {
    const domain = normalizeDomain(this.draftFor(institution.id));
    if (!domain) return;

    this.busyId.set(institution.id);
    this.api.addDomain(institution.id, domain).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.setDraft(institution.id, '');
        this.busyId.set(null);
        this.notify.success(`@${domain} now validates into ${updated.name}`);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not add that domain');
      },
    });
  }

  removeDomain(institution: Institution, domainId: string): void {
    this.busyId.set(institution.id);
    this.api.removeDomain(institution.id, domainId).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.busyId.set(null);
        this.notify.info('Domain removed. Existing members keep their access.');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not remove that domain');
      },
    });
  }

  toggleActive(institution: Institution, isActive: boolean): void {
    this.busyId.set(institution.id);
    this.api.update(institution.id, { isActive }).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.busyId.set(null);
        this.notify.info(
          isActive
            ? `${updated.name} is active again`
            : `${updated.name} is paused — its domains no longer auto-validate`,
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify.showHttpError(error, 'Could not update the institution');
      },
    });
  }

  private replace(updated: Institution): void {
    this.institutions.update((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
}
