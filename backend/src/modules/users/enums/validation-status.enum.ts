/**
 * Whether we believe this person really belongs to the institution they claim.
 *
 * Auto path : they signed up with an address on a domain we know (e.g. @stanford.edu)
 *             -> VALIDATED with method EMAIL_DOMAIN, no human involved.
 * Manual path: they signed up with e.g. @gmail.com -> PENDING until a program
 *              director (or an admin) approves them -> VALIDATED, method MANUAL.
 */
export enum ValidationStatus {
  PENDING = 'pending',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
}

export enum ValidationMethod {
  /** The signup email matched a domain registered to an institution. */
  EMAIL_DOMAIN = 'email_domain',
  /** A program director or admin approved the person by hand. */
  MANUAL = 'manual',
}
