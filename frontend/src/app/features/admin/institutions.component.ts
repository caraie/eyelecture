import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { Institution } from '../../core/models/institution.model';

/** Strips a leading @ and lowercases, mirroring what the API stores. */
const normalizeDomain = (value: string): string =>
  value.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');

@Component({
  selector: 'el-institutions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
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
  /** Per-institution scratch value for the "add a domain" input. */
  readonly domainDrafts = signal<Record<string, string>>({});
  readonly busyId = signal<string | null>(null);

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

  draftFor(id: string): string {
    return this.domainDrafts()[id] ?? '';
  }

  setDraft(id: string, value: string): void {
    this.domainDrafts.update((drafts) => ({ ...drafts, [id]: value }));
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
