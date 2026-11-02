import type { ResultKeptStep } from "./step.ts";

/** Core's finding that a submission no longer has such steps, and no condition of it tests their words (`./kept-steps.ts`, t666). */

export type ResultKeptStepDrop = {
  dropped: ResultKeptStep[];
  /** Core's words for the builder: each step, as written, the option it chose and the request's words it is. */
  said: string;
};
