// What a supervisor plan part says its answer is, as authoring reads it (K5).
//
// The part's `answer` (`../../project-agents/supervisor/tools.ts`) names the
// columns of the records the part hands back. Authoring never reads the plan
// itself: whoever builds a step knows which part it serves and passes this,
// by step (`AuthoringPartOfStep`), so a record output the model left out the
// parts of is declared from the part's own words rather than from the step's.

/** The part a step serves, reduced to what a record output is derived from. */
export type AuthoringPartAnswer = {
  /** The part's id: names the dataset a step of it writes, together with the step's own id. */
  id: string;
  /** The part's own words for what it gives, as the label of the list. Absent, the step's words. */
  label?: string | undefined;
  /** The answer's columns, in the order the answer gives them. */
  columns: readonly string[];
  /**
   * The fields whose values together identify a row, when the client says so
   * (CC3, `rowIdentity`). Absent, a dataset de-duplicates by its whole row.
   */
  rowIdentity?: readonly string[] | undefined;
};

/** Which part the step with this stable id serves, or `undefined` for a step that serves none. */
export type AuthoringPartOfStep = (stepId: string) => AuthoringPartAnswer | undefined;
