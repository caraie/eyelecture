/**
 * Whether an attempt was taken before studying the lecture or after it.
 *
 * The learner does not choose: it is decided when the attempt starts, from
 * whether they had finished the lecture by then. Letting them pick would make
 * the pre/post comparison meaningless.
 */
export enum QuizPhase {
  PRE = 'pre',
  POST = 'post',
}
