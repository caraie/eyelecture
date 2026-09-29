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
  PROFILE_FIELDS,
  ProfileFields,
  TRAINEE_ROLES,
  UserRole,
} from '../../core/models/user.model';

type SignupRole = Exclude<UserRole, 'super_user'>;

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
    // The anchor of the account, and the only address that survives leaving an
    // institution. Required of everybody.
    personalEmail: ['', [Validators.required, Validators.email]],
    // Required for every user type that implies an institution — which is all of
    // them except the attending physician. The validator follows the type.
    email: ['', [Validators.email]],
    requestedInstitutionId: [''],
    // Required or refused depending on the user type; see `fields` below. The two
    // programmes stay optional for everybody who is offered them, because the
    // reference lists are still short and nobody should be stuck behind an entry
    // that has not been added yet.
    trainingLevelId: [''],
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
   * What this user type is asked, straight from the table the API enforces. Nothing
   * in this component decides on its own which fields to show.
   */
  readonly fields = computed<ProfileFields>(() => {
    const role = this.role();
    return role === ''
      ? { institution: false, level: false, specialty: false, programs: false }
      : PROFILE_FIELDS[role];
  });

  /**
   * Whether a matching domain would let them in on its own. Only trainees; an
   * attending physician is reviewed either way, and a program administrator vouches
   * for other people — neither is something a domain match can establish.
   */
  readonly autoValidatesOnDomain = computed(() => {
    const role = this.role();
    return role !== '' && TRAINEE_ROLES.includes(role);
  });

  readonly specialties = signal<PublicCatalogItem[]>([]);
  readonly levels = signal<PublicCatalogItem[]>([]);
  readonly residencies = signal<PublicCatalogItem[]>([]);
  readonly fellowships = signal<PublicCatalogItem[]>([]);
  private catalogsRequested = false;
  private levelsRequested = false;

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
   * Only somebody who needs an institution and whose domain resolves to nothing has
   * anything to pick. For an attending physician there is nothing to choose — they
   * hold an unaffiliated account — and showing the picker would imply otherwise.
   */
  readonly needsInstitutionPicker = computed(
    () => this.fields().institution && this.matchedInstitution() === null,
  );

  constructor() {
    this.institutionsApi.listPublic().subscribe({
      next: (list) => this.institutions.set(list),
      error: () => this.institutions.set([]),
    });

    // Fetched the first time somebody picks a user type that needs them, rather than
    // on load: a medical student never sees any of these lists.
    effect(() => {
      const fields = this.fields();
      if (fields.level && !this.levelsRequested) {
        this.levelsRequested = true;
        this.catalogsApi.listPublic('levels').subscribe({
          next: (list) => this.levels.set(list),
          error: () => this.levels.set([]),
        });
      }
      if (!fields.specialty || this.catalogsRequested) return;
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

    // Requirements follow the user type rather than sitting on the controls for
    // everybody. Clearing a control the type does not have matters as much as the
    // validator: the API refuses a value it did not ask for, so a leftover from a
    // type somebody picked and changed their mind about would fail the submit with
    // a message about a field that is no longer on screen.
    effect(() => {
      const fields = this.fields();

      this.applyRequirement(this.form.controls.email, fields.institution);
      this.applyRequirement(this.form.controls.trainingLevelId, fields.level);
      this.applyRequirement(this.form.controls.specialtyId, fields.specialty);

      if (!fields.programs) {
        this.form.controls.residencyProgramId.setValue('', { emitEvent: false });
        this.form.controls.fellowshipProgramId.setValue('', { emitEvent: false });
      }
    });
  }

  private applyRequirement(
    control: (typeof this.form.controls)[
      | 'email'
      | 'trainingLevelId'
      | 'specialtyId'],
    required: boolean,
  ): void {
    if (required) {
      control.addValidators(Validators.required);
    } else {
      control.removeValidators(Validators.required);
      control.setValue('', { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (raw.role === '') return;

    const fields = this.fields();

    this.submitting.set(true);
    this.auth
      .completeProfile({
        role: raw.role,
        personalEmail: raw.personalEmail.trim().toLowerCase(),
        ...(fields.institution && raw.email.trim()
          ? { email: raw.email.trim().toLowerCase() }
          : {}),
        ...(this.needsInstitutionPicker() && raw.requestedInstitutionId
          ? { requestedInstitutionId: raw.requestedInstitutionId }
          : {}),
        ...(fields.level ? { trainingLevelId: raw.trainingLevelId } : {}),
        ...(fields.specialty ? { specialtyId: raw.specialtyId } : {}),
        ...(fields.programs && raw.residencyProgramId
          ? { residencyProgramId: raw.residencyProgramId }
          : {}),
        ...(fields.programs && raw.fellowshipProgramId
          ? { fellowshipProgramId: raw.fellowshipProgramId }
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
