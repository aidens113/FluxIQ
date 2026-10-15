import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/**
 * One step of the Flow that produced the result, as the judgement reads it.
 *
 * It carried a node id and a definition id and nothing else, and that is not
 * enough to answer the question the judgement is asked. The instruction tells
 * the judge to answer `no` for "a Flow with no step that could have narrowed or
 * filtered what the request asked to narrow" -- and two definition ids apart, a
 * Flow that filters on the right field and a Flow that filters on the wrong one
 * are the same list of names. Five consecutive live runs were refuted with that
 * list in front of the judge, correctly, and with nothing in the refutation that
 * said which step was wrong.
 *
 * So the step now carries what the Flow authored it with, screened by
 * `repair-context/parameter-screen.ts` -- the same projection, the same screens
 * and the same dotted-path notation the *repair* has been shown since t139. A
 * judgement poorer than the repair that follows it is the parity gap this closes.
 */
export type AutomationStudioResultFlowStepSummary = {
  nodeId: string;
  definitionId: string;
  /** What the Flow calls this step, when it named one. Bounded. */
  label?: string;
  /**
   * The parameters the Flow authored this step with, screened: shapes and
   * names, never the person's data. Absent when the step has none, when no
   * declared-keys list was supplied, or when the summary's byte budget was
   * spent before this step was reached.
   */
  parameters?: JsonObject;
  /** The dotted paths whose authored value is not in `parameters` as the Flow wrote it. Never the values. */
  parametersWithheld?: string[];
  /**
   * What this run saw the step change where it stayed, one entry per time it
   * ran, in run order: the domain's own view lines that appeared (`added`) and
   * left (`removed`), screened (`./step-changes.ts`). Never for a run of the
   * step that moved to another location; absent when no run of it reported a
   * change, or when none was sendable (which sets the summary's `withheld`).
   * Run `run-muw5zv4m-52d83027`: judges shown only status rows and the end
   * read one "+" press as a quantity of 1.
   */
  changed?: Array<{ added?: string; removed?: string }>;
  /**
   * For a step that runs once per row of a list loop, the rows it acted on in
   * this run, one per pass, each by its own fields, screened (`./step-rows.ts`,
   * t475). Present only for such a step in a summary of a run; the row it was
   * written on is then left out of `parameters`, and `perRow` says so. Lane D
   * round 10's judge read a Confirm step's written-on row as a row it acted on.
   */
  rowsActedOn?: JsonValue[];
  perRow?: string;
};
