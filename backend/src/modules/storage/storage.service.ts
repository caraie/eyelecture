/**
 * Where lecture files live, behind one interface.
 *
 * The shape is deliberately not "give me the bytes". A presentation is tens of
 * megabytes and a video can be hundreds; Cloud Run refuses a request body over
 * 32 MiB, so anything that streams uploads *through* the API is a design that
 * fails on the first real lecture. Instead the API hands the browser a signed
 * URL and the browser talks to the store directly.
 *
 * Two adapters implement it: Cloud Storage in the deployed environments, and a
 * local directory for development, where the signed URL points back at the
 * API's own endpoint. The browser does the same plain PUT either way, so there
 * is one upload path in the frontend rather than one per environment.
 */
import type { Readable } from 'node:stream';

export interface UploadTicket {
  /** Where to PUT the bytes. */
  url: string;
  /** Headers the PUT must carry, or the signature will not match. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export abstract class StorageService {
  /** A URL the browser may PUT this exact content type to, for a short while. */
  abstract uploadUrl(key: string, contentType: string): Promise<UploadTicket>;

  /**
   * A URL the browser may GET for a short while. `filename` sets the download
   * name, which is what makes a saved file land as "Angle closure.pdf" rather
   * than as the opaque key.
   */
  abstract readUrl(key: string, filename?: string): Promise<string>;

  /**
   * The bytes, for the few cases where the browser must not talk to the store.
   *
   * The signed URL above is still the right answer for a video: hundreds of
   * megabytes, seeked back and forth, and the store does ranges properly. But
   * it sends the browser to a second host, and a browser that cannot reach
   * that host fails on exactly one screen while the rest of the app works —
   * which is what happened to readers whose Chrome would not fetch from
   * storage.googleapis.com though Safari on the same machine would.
   *
   * A presentation is a few megabytes and is read start to finish, so the API
   * can hand it over itself and the browser only ever has one host to reach.
   */
  abstract readStream(key: string): Promise<{
    stream: Readable;
    size: number;
    contentType?: string;
  }>;

  /**
   * Whether the object is really there, and how big. Called when the client
   * says an upload finished: the client is not a reliable narrator, and a
   * lecture row pointing at an object that was never written is worse than a
   * failed upload the author can retry.
   */
  abstract stat(key: string): Promise<{ size: number } | null>;

  abstract remove(key: string): Promise<void>;
}
