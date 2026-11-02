import type { ResultKeptCondition } from "./condition.ts";

/** Core's finding that a submission drops or changes kept conditions (`./kept-condition-drop.ts`, t641). */

export type ResultKeptConditionDrop = {
  /** The kept conditions it no longer writes as they were written. */
  dropped: ResultKeptCondition[];
  /** Core's words for the builder: each condition, as written, and the rows it keeps out. */
  said: string;
};
