import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { InstitutionsService } from '../../core/services/institutions.service';
import { NotificationService } from '../../core/services/notification.service';
import { PublicInstitution } from '../../core/models/institution.model';
import { PublicCatalogItem } from '../../core/models/catalog.model';
import {
  ROLE_BLURBS,
  ROLE_LABELS,
  SELF_SIGNUP_ROLES,
  TRAINEE_ROLES,
  UserRole,
} from '../../core/models/user.model';

type SignupRole = Exclude<UserRole, 'admin'>;

/**
 * Step two: rank and addresses.
 *
 * Reachable only while the account is unfinished — the guard sends anybody else
 * away — and the only screen reachable while it is, which is why it carries its own
 * explanation rather than relying on the shell's navigation for context.
 */
@Component({
  selector: 'el-complete-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './complete-profile.component.html',
  styleUrl: './complete-profile.component.scss',
})
export class CompleteProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly institutionsApi = inject(InstitutionsService);
  private readonly catalogsApi = inject(CatalogsService);
  private readonly notify = inject(NotificationService);

  readonly roles = SELF_SIGNUP_ROLES as SignupRole[];
  readonly roleLabels = ROLE_LABELS;
  readonly roleBlurbs = ROLE_BLURBS;

  readonly user = this.auth.user;
  readonly submitting = signal(false);
  readonly institutions = signal<PublicInstitution[]>([]);
  /**
   * Set once the profile is saved. The form is replaced by a confirmation rather
   * than routed away from: the next thing to do is in their inbox, not in the app,
   * and dropping them on a dashboard would bury that.
   */
  readonly done = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    role: ['' as SignupRole | '', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    // Optional: requiring it would block signing up on something the profile
    // screen can collect any time afterwards.
    secondaryEmail: ['', [Validators.email]],
    requestedInstitutionId: [''],
    // Attending physicians only. The specialty becomes required when that rank is
    // picked; the two programmes stay optional, because the reference lists are
    // still placeholders and nobody should be stuck behind a missing entry.
    specialtyId: [''],
    residencyProgramId: [''],
    fellowshipProgramId: [''],
  });

  /** Whichever rank is selected, or null while none is. */
  private readonly role = toSignal(
    this.form.controls.role.valueChanges.pipe(startWith(this.form.controls.role.value)),
    { initialValue: this.form.controls.role.value },
  );

  /**
   * Trainees are expected to hold an institution address; an attending physician is
   * not. The copy on the address field changes accordingly, because "institutional
   * email" is wrong advice for two of the five ranks.
   */
  readonly expectsInstitutionalEmail = computed(() => {
    const role = this.role();
    return role !== '' && TRAINEE_ROLES.includes(role);
  });

  /** Attending physicians describe their practice; nobody else does, for now. */
  readonly isAttending = computed(() => this.role() === 'attending_physician');

  readonly specialties = signal<PublicCatalogItem[]>([]);
  readonly residencies = signal<PublicCatalogItem[]>([]);
  readonly fellowships = signal<PublicCatalogItem[]>([]);
  private catalogsRequested = false;

  /** What the typed address resolves to, looked up while they type. */
  private readonly lookup = toSignal(
    this.form.controls.email.valueChanges.pipe(
      debounceTime(450),
      distinctUntilChanged(),
      switchMap((email) =>
        email && email.includes('@')
          ? this.institutionsApi.lookup(email)
          : of({ matched: false, institution: null }),
      ),
    ),
    { initialValue: { matched: false, institution: null } },
  );

  readonly matchedInstitution = computed(() => this.lookup()?.institution ?? null);

  /**
   * Only trainees on an unrecognised domain need to name an institution. For an
   * attending physician there is nothing to pick — they are reviewed by platform
   * staff either way — and showing the picker would imply otherwise.
   */
  readonly needsInstitutionPicker = computed(
    () => this.expectsInstitutionalEmail() && this.matchedInstitution() === null,
  );

  constructor() {
    this.institutionsApi.listPublic().subscribe({
      next: (list) => this.institutions.set(list),
      error: () => this.institutions.set([]),
    });

    // Fetched the first time somebody picks the rank that needs them, rather than on
    // load: four of the five ranks never see these lists.
    effect(() => {
      if (!this.isAttending() || this.catalogsRequested) return;
      this.catalogsRequested = true;

      this.catalogsApi.listPublic('specialties').subscribe({
        next: (list) => this.specialties.set(list),
        error: () => this.specialties.set([]),
      });
      this.catalogsApi.listPublic('residencies').subscribe({
        next: (list) => this.residencies.set(list),
        error: () => this.residencies.set([]),
      });
      this.catalogsApi.listPublic('fellowships').subscribe({
        next: (list) => this.fellowships.set(list),
        error: () => this.fellowships.set([]),
      });
    });

    // The specialty is only meaningful for an attending, so the requirement follows
    // the rank rather than sitting on the control for everybody.
    effect(() => {
      const control = this.form.controls.specialtyId;
      if (this.isAttending()) {
        control.addValidators(Validators.required);
      } else {
        control.removeValidators(Validators.required);
        control.setValue('', { emitEvent: false });
        this.form.controls.residencyProgramId.setValue('', { emitEvent: false });
        this.form.controls.fellowshipProgramId.setValue('', { emitEvent: false });
      }
      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (raw.role === '') return;

    this.submitting.set(true);
    this.auth
      .completeProfile({
        role: raw.role,
        email: raw.email.trim().toLowerCase(),
        ...(raw.secondaryEmail.trim()
          ? { secondaryEmail: raw.secondaryEmail.trim().toLowerCase() }
          : {}),
        ...(this.needsInstitutionPicker() && raw.requestedInstitutionId
          ? { requestedInstitutionId: raw.requestedInstitutionId }
          : {}),
        ...(this.isAttending()
          ? {
              specialtyId: raw.specialtyId,
              ...(raw.residencyProgramId
                ? { residencyProgramId: raw.residencyProgramId }
                : {}),
              ...(raw.fellowshipProgramId
                ? { fellowshipProgramId: raw.fellowshipProgramId }
                : {}),
            }
          : {}),
      })
      .subscribe({
        next: ({ message }) => {
          this.submitting.set(false);
          this.done.set(message);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.notify.showHttpError(error, 'Could not save your profile');
        },
      });
  }

  signOut(): void {
    this.auth.logout();
  }
}
