/**
 * A lecture is a draft until its author says otherwise. Only published ones
 * appear in the bank — which means an author can upload a 200 MB video over two
 * sittings without anybody seeing half a lecture.
 */
export enum LectureStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}
