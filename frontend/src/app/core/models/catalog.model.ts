/** The three reference lists a profile is built from. Matches the API's URL segment. */
export type CatalogKind = 'specialties' | 'residencies' | 'fellowships';

export const CATALOG_KINDS: CatalogKind[] = [
  'specialties',
  'residencies',
  'fellowships',
];

export interface CatalogMeta {
  /** Plural, for the column heading. */
  title: string;
  /** Singular, for buttons and messages. */
  singular: string;
  icon: string;
  blurb: string;
  placeholder: string;
}

export const CATALOG_META: Record<CatalogKind, CatalogMeta> = {
  specialties: {
    title: 'Specialties',
    singular: 'specialty',
    icon: 'visibility',
    blurb: 'Clinical focus. Attending physicians pick one.',
    placeholder: 'Glaucoma',
  },
  residencies: {
    title: 'Residency programs',
    singular: 'residency program',
    icon: 'local_hospital',
    blurb: 'Where somebody trained as a resident.',
    placeholder: 'Montefiore-Einstein',
  },
  fellowships: {
    title: 'Fellowship programs',
    singular: 'fellowship program',
    icon: 'workspace_premium',
    blurb: 'Where somebody did their fellowship.',
    placeholder: 'Stanford Medical Center',
  },
};

export interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

/** What the signup form is allowed to see before the visitor authenticates. */
export interface PublicCatalogItem {
  id: string;
  name: string;
}
