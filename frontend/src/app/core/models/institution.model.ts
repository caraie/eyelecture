export interface InstitutionDomain {
  id: string;
  domain: string;
}

export interface Institution {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  domains: InstitutionDomain[];
  createdAt: string;
}

/** What the signup form is allowed to see before the visitor authenticates. */
export interface PublicInstitution {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface CreateInstitutionPayload {
  name: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
  domains?: string[];
  isActive?: boolean;
}

export type UpdateInstitutionPayload = Partial<
  Omit<CreateInstitutionPayload, 'domains'>
>;

/**
 * An offer to administer an institution. Four states, and only `pending` is live —
 * the other three are history, kept so the row can answer "did we ever ask them".
 */
export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  state: InvitationState;
  expiresAt: string;
  acceptedAt: string | null;
  invitedByName: string | null;
  acceptedByName: string | null;
  createdAt: string;
  /** Only present when mail is switched off, so the link is still reachable. */
  devLink?: string;
}

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  pending: 'Waiting',
  accepted: 'Accepted',
  revoked: 'Withdrawn',
  expired: 'Expired',
};

/** What the person holding the link sees before they fill anything in. */
export interface InvitationPreview {
  institutionName: string;
  email: string;
  expiresAt: string;
}

/** Answer to "will this email address validate me automatically?". */
export interface DomainLookup {
  matched: boolean;
  institution: PublicInstitution | null;
}
