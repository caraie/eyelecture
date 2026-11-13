/**
 * The three files a lecture can carry. One of each at most, which is why the
 * unique index is on (lectureId, kind): replacing a file overwrites the row
 * rather than leaving two presentations and no way to say which is current.
 */
export enum LectureAssetKind {
  PRESENTATION = 'presentation',
  VIDEO = 'video',
  TILE = 'tile',
}
