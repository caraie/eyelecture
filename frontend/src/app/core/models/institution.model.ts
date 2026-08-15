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

/** Answer to "will this email address validate me automatically?". */
export interface DomainLookup {
  matched: boolean;
  institution: PublicInstitution | null;
}
