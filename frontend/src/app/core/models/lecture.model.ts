/** A lecture is a draft until its author publishes it. */
export type LectureStatus = 'draft' | 'published';

/** Who a published lecture is for. */
export type LectureVisibility = 'all_institutions' | 'own_institution';

/** The three files a lecture can carry, one of each at most. */
export type LectureAssetKind = 'presentation' | 'video' | 'tile';

export interface LectureAsset {
  kind: LectureAssetKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string | null;
}

export interface Lecture {
  id: string;
  subsectionId: string;
  title: string;
  objectives: string | null;
  keywords: string[];
  status: LectureStatus;
  visibility: LectureVisibility;
  publishedAt: string | null;
  /** Null when the author's account was deleted — the screen says so. */
  authorName: string | null;
  institutionName: string | null;
  assets: LectureAsset[];
  createdAt: string;
}

/** Where the browser must PUT a file, and what it has to send with it. */
export interface UploadTicket {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * What each kind of file may be. The server enforces this; the input's
 * `accept` is here so the file picker does not offer what will be refused.
 *
 * Presentations are PDF only. A browser cannot display a .pptx, so showing one
 * inside the app means converting it server-side — a piece of work with its own
 * ticket. Until then, "export to PDF" is one menu item away in PowerPoint.
 */
export const ASSET_RULES: Record<
  LectureAssetKind,
  { accept: string; label: string; maxLabel: string }
> = {
  presentation: {
    accept: 'application/pdf',
    label: 'Presentation (PDF)',
    maxLabel: '200 MB',
  },
  video: {
    accept: 'video/mp4,video/quicktime',
    label: 'Video (MP4 or MOV)',
    maxLabel: '5 GB',
  },
  tile: {
    accept: 'image/jpeg,image/png,image/webp',
    label: 'Tile image',
    maxLabel: '10 MB',
  },
};
