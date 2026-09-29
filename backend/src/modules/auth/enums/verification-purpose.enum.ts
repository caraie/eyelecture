/**
 * What a verification token proves.
 *
 * Both kinds live in the same table because the mechanics are identical — hash,
 * expiry, single use. The purpose is what keeps them from being interchangeable: a
 * token minted to confirm a personal address must not be replayable against the
 * institutional one, which is the address that decides membership.
 */
export enum VerificationPurpose {
  INSTITUTIONAL_EMAIL = 'primary_email',
  /**
   * The stored value stays `secondary_email`. The name changed when the personal
   * address became the required one; the string is a Postgres enum with live rows
   * behind it, and renaming it would buy nothing but a migration.
   */
  PERSONAL_EMAIL = 'secondary_email',
}
