/** Account lifecycle, independent of institution membership. */
export enum UserStatus {
  /** Registered, email not confirmed yet. Cannot log in. */
  PENDING_EMAIL_VERIFICATION = 'pending_email_verification',
  /** Email confirmed. Can log in. */
  ACTIVE = 'active',
  /** Disabled by an admin. Cannot log in. */
  SUSPENDED = 'suspended',
}
