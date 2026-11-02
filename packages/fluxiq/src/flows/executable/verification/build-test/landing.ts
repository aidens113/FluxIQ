/**
 * A checked step's act as the build did it earlier in this build, when a rerun
 * did it or a later check replaced the step's record (t443): `counts` when it
 * ran after the steps before it -- done again on its put-back page, or already
 * in the state it found -- as the step now stands. `after` is those steps with
 * their words (the choices it was made with); `pressed`, its own words when
 * they are not the step's now; `why`, why it does not count.
 */

export type BuildTestLanding = {
  counts: boolean;
  after?: Array<{ step: number; target?: string[] }>;
  pressed?: string[];
  why?: string;
};
