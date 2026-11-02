/**
 * One thing a capability check found of the Flow a build proposes, carried to
 * the judge of its test as information (t195-w28a).
 *
 * The completion check used to refuse a Flow for it -- no step producing the
 * records the instruction asks for, no step going to where the Flow starts --
 * and send the model back to explore. Under the no-restrictions rule only the
 * permission gates refuse, so the Flow goes to its test and its judge, and
 * this is what the check found, for the judge to confirm against the steps and
 * for the repair to be told through the judge's reasons.
 *
 * Core's words and the instruction's only: the check's issue code and
 * sentence, the columns the instruction named, where the build was told to start.
 */

export type BuildTestNote = {
  code: "bootstrap.cannot_answer_instruction" | "bootstrap.cannot_reach_start_location";
  /** Core's own sentence for what was found, quoting nothing. */
  said: string;
  /** The columns the instruction named, for a Flow that produces no records. */
  columns?: string[];
  /** Where the Flow starts, for a Flow no step of which goes there. */
  starts?: string;
};
