/**
 * Whether a file had to be turned into something the app can show, and how
 * that went.
 *
 * `NONE` is a file that needed nothing — a PDF uploaded as a PDF. It is the
 * default, so every asset that existed before conversion did reads correctly
 * without a backfill.
 */
export enum AssetConversionStatus {
  NONE = 'none',
  PENDING = 'pending',
  READY = 'ready',
  FAILED = 'failed',
}
