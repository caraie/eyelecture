/** A lecture is a draft until its author publishes it. */
export type LectureStatus = 'draft' | 'published';

/** Who a published lecture is for. */
export type LectureVisibility = 'all_institutions' | 'own_institution';

/** The three files a lecture can carry, one of each at most. */
export type LectureAssetKind = 'presentation' | 'video' | 'tile';

/**
 * Whether the file had to be turned into something the viewer can read.
 * "none" is a PDF uploaded as a PDF, which needed nothing.
 */
export type AssetConversionStatus = 'none' | 'pending' | 'ready' | 'failed';

export interface LectureAsset {
  kind: LectureAssetKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string | null;
  conversionStatus: AssetConversionStatus;
  /** Only set when it failed, and written for the author to act on. */
  conversionError: string | null;
  /** There is an editable deck behind the PDF learners read. */
  hasOriginal: boolean;
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
  authorId: string | null;
  /** Null when the author's account was deleted — the screen says so. */
  authorName: string | null;
  /** Who filed it, and only when that is somebody other than the author. */
  createdByName: string | null;
  institutionName: string | null;
  assets: LectureAsset[];
  coAuthors: CoAuthor[];
  /** Zero means the lecture has no quiz at all. */
  questionCount: number;
  quizAvailability: QuizAvailability;
  createdAt: string;
}

/**
 * Somebody credited on a lecture besides its author.
 *
 * `invited` means they have only been written to — the chip the old app had no
 * way of producing. Credit only, for now: their name goes on the lecture, but
 * editing it stays with the author and the administrators.
 */
export interface CoAuthor {
  id: string;
  userId: string | null;
  name: string;
  institutionName: string | null;
  invited: boolean;
  expired: boolean;
}

/** Somebody to pick from when searching. No address comes back. */
export interface Person {
  id: string;
  name: string;
  institutionName: string | null;
  role: string | null;
}

/** When a learner may take the quiz: before the lecture, after it, or both. */
export type QuizAvailability = 'pre' | 'post' | 'both';

export interface QuizOption {
  id: string;
  text: string;
  /** Only ever sent to someone who may edit the lecture. */
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  explanation: string | null;
  options: QuizOption[];
}

/** A question on its way to the server — ids are the server's business. */
export interface SaveQuestion {
  prompt: string;
  explanation?: string | null;
  options: { text: string; isCorrect: boolean }[];
}

export const QUIZ_RULES = { minOptions: 2, maxOptions: 6 } as const;

/** Before studying the lecture, or after. The server decides, not the learner. */
export type QuizPhase = 'pre' | 'post';

export const QUIZ_PHASE_LABELS: Record<QuizPhase, string> = {
  pre: 'Pre-lecture',
  post: 'Post-lecture',
};

/**
 * One question of an attempt. `correctIndex` and `explanation` only arrive
 * once the attempt has been submitted — before that they would be the answer
 * key.
 */
export interface AttemptQuestion {
  sortOrder: number;
  prompt: string;
  options: string[];
  chosenIndex: number | null;
  correctIndex: number | null;
  explanation: string | null;
}

export interface QuizAttempt {
  id: string;
  lectureId: string;
  lectureTitle: string | null;
  phase: QuizPhase;
  startedAt: string;
  submittedAt: string | null;
  score: number;
  total: number;
  questions: AttemptQuestion[];
}

/** A row of the history, where the questions themselves are not needed. */
export interface QuizAttemptSummary {
  id: string;
  lectureId: string;
  lectureTitle: string | null;
  phase: QuizPhase;
  submittedAt: string | null;
  score: number;
  total: number;
}

export interface LectureProgress {
  startedAt: string;
  completedAt: string | null;
}

export const QUIZ_AVAILABILITY_LABELS: Record<QuizAvailability, string> = {
  pre: 'Before the lecture only',
  post: 'After the lecture only',
  both: 'Before and after',
};

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
 * A presentation may be a PDF or a PowerPoint deck. A browser cannot display a
 * .pptx, so a deck is turned into a PDF on the server and both are kept: the
 * PDF is what learners read, the deck is what a co-author picks up to edit.
 */
export const ASSET_RULES: Record<
  LectureAssetKind,
  { accept: string; label: string; maxLabel: string }
> = {
  presentation: {
    // The deck is converted to a PDF server-side; both are kept. `.pptx` and
    // `.ppt` are listed as well as their media types because Windows does not
    // always give the file a type the picker will match on.
    accept:
      'application/pdf,.pdf,' +
      'application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,' +
      'application/vnd.ms-powerpoint,.ppt,' +
      'application/vnd.oasis.opendocument.presentation,.odp',
    label: 'Presentation (PDF or PowerPoint)',
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
