/** Account lifecycle, independent of institution membership. */
export enum UserStatus {
  /**
   * Username and password exist, nothing else does. Signing in works, but the only
   * screen reachable is "Complete your profile" — there is no rank yet, and no
   * address to send anything to.
   */
  PENDING_PROFILE = 'pending_profile',
  /** Profile complete, email not confirmed yet. Cannot log in. */
  PENDING_EMAIL_VERIFICATION = 'pending_email_verification',
  /** Email confirmed. Can log in. */
  ACTIVE = 'active',
  /** Disabled by an admin. Cannot log in. */
  SUSPENDED = 'suspended',
}
