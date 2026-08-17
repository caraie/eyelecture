/**
 * What a verification token proves.
 *
 * Both kinds live in the same table because the mechanics are identical — hash,
 * expiry, single use. The purpose is what keeps them from being interchangeable: a
 * token minted to confirm a personal address must not be replayable against the
 * institutional one, which is the address that decides membership.
 */
export enum VerificationPurpose {
  PRIMARY_EMAIL = 'primary_email',
  SECONDARY_EMAIL = 'secondary_email',
}
