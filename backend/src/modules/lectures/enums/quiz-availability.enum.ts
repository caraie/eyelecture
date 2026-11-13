/**
 * When a lecture's quiz can be taken.
 *
 * The point of the pre/post pair is comparison: the same questions before and
 * after, so a learner can see what the lecture actually taught them. An author
 * who only wants the "after" half says so here.
 */
export enum QuizAvailability {
  PRE = 'pre',
  POST = 'post',
  BOTH = 'both',
}
