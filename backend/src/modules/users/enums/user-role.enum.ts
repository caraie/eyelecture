/**
 * What somebody is, which is also what they may do.
 *
 * Rank and permission are one axis on purpose. Splitting them would be more
 * flexible, but it would mean maintaining a permission matrix for a product where,
 * today, four of the six values have identical rights. When an attending physician
 * needs administrative powers, that is the moment to split — not before.
 *
 * Two kinds of administrator, and the distinction matters:
 *
 * - SUPER_USER is the platform's own staff. It spans every institution and is never
 *   self-assignable.
 * - PROGRAM_ADMINISTRATOR runs one institution and sees only that institution.
 *   Named for the programme rather than the residency because a fellowship need not
 *   hang off a residency, and the person running it is still the one who vouches.
 *
 * Everything other than SUPER_USER is chosen by the person while completing their
 * profile.
 */
export enum UserRole {
  MEDICAL_STUDENT = 'medical_student',
  RESIDENT = 'resident',
  FELLOW = 'fellow',
  ATTENDING_PHYSICIAN = 'attending_physician',
  PROGRAM_ADMINISTRATOR = 'program_administrator',
  SUPER_USER = 'super_user',
}

/** Ranks a person may pick for themselves. SUPER_USER is deliberately absent. */
export const SELF_SIGNUP_ROLES: readonly UserRole[] = [
  UserRole.MEDICAL_STUDENT,
  UserRole.RESIDENT,
  UserRole.FELLOW,
  UserRole.ATTENDING_PHYSICIAN,
  UserRole.PROGRAM_ADMINISTRATOR,
];

/**
 * The ranks that are still in training, and so are expected to hold an address at
 * the institution they claim. These are the only ones a matching email domain can
 * validate on its own — an attending physician may well sign up from a personal
 * address, and a program administrator vouches for other people, so neither is
 * ever let in by a domain match alone.
 */
export const TRAINEE_ROLES: readonly UserRole[] = [
  UserRole.MEDICAL_STUDENT,
  UserRole.RESIDENT,
  UserRole.FELLOW,
];

/** Can open the validation queue and act on the people in it. */
export const REVIEWER_ROLES: readonly UserRole[] = [
  UserRole.SUPER_USER,
  UserRole.PROGRAM_ADMINISTRATOR,
];
