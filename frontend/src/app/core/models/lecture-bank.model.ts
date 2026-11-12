/**
 * The shelves of the Lecture Bank. Two levels and no more: a Section holds
 * Subsections, and every lecture will belong to exactly one Subsection.
 */
export interface Subsection {
  id: string;
  sectionId: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface Section {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  subsections: Subsection[];
}

/**
 * What the browse sidebar is filtered by. `null` is "Show all" — a value rather
 * than an absent one, so the template never has to ask whether a filter exists
 * and what it means if it does not.
 */
export type BankFilter =
  | { kind: 'all' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'subsection'; sectionId: string; subsectionId: string };
