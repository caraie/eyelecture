/**
 * The three reference lists, addressed as a URL segment: /catalogs/<kind>.
 *
 * One controller serves all three because the operations are identical. The
 * storage is still one table each, so any of them can grow its own columns
 * without dragging the other two along.
 */
export enum CatalogKind {
  SPECIALTIES = 'specialties',
  RESIDENCIES = 'residencies',
  FELLOWSHIPS = 'fellowships',
}

export const CATALOG_KINDS = Object.values(CatalogKind);

/** Singular, for error messages people read: "That specialty was not found". */
export const CATALOG_LABELS: Record<CatalogKind, string> = {
  [CatalogKind.SPECIALTIES]: 'specialty',
  [CatalogKind.RESIDENCIES]: 'residency program',
  [CatalogKind.FELLOWSHIPS]: 'fellowship program',
};

/** Spelled out rather than derived: appending "s" to "specialty" gives "specialtys". */
export const CATALOG_LABELS_PLURAL: Record<CatalogKind, string> = {
  [CatalogKind.SPECIALTIES]: 'specialties',
  [CatalogKind.RESIDENCIES]: 'residency programs',
  [CatalogKind.FELLOWSHIPS]: 'fellowship programs',
};
