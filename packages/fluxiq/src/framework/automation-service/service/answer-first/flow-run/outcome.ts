// What a saved Flow's run came to, for the attempt to read (`../attempt/`). A run that failed is
// an answer, not an ending: the attempt carries on from it. `happened` is Core's words only.

export type AutomationStudioAnswerFirstFlowRunStep = {
  /** The step's position in the saved draft: what the model and the attempt's row call it. */
  position: number;
  label?: string;
  ran: "passed" | "failed" | "skipped" | "not_reached";
  happened?: string;
};

export type AutomationStudioAnswerFirstFlowRunOutcome =
  /** The saved steps do not make a Flow that can run. Nothing was asked and nothing was sent. */
  | { kind: "not_assembled"; codes: readonly string[] }
  /** A person said no, or there is nobody to say yes. Nothing was sent. */
  | { kind: "permission_declined"; consequences: readonly string[] }
  /** A person's Stop. */
  | { kind: "stopped" }
  | {
    kind: "ran";
    /** The Flow ran from its start to its end. Whether that is the person's result is the judge's. */
    reachedEnd: boolean;
    /** Every step of the Flow, by position. A step left out of the plan is absent. */
    steps: AutomationStudioAnswerFirstFlowRunStep[];
    /** Where it stopped, whenever it did not reach the end. */
    failing?: { position: number; label?: string; happened: string; code?: string };
  };
