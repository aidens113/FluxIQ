// What a saved Flow's run came to, for the attempt to read (`../attempt/`). A run that failed is
// an answer, not an ending: the attempt carries on from it. `happened` is Core's words only.
import type { AutomationStudioNodeAttemptTrace } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioAnswerFirstExecutableSource } from "./execution-identity.ts";

export type AutomationStudioAnswerFirstFlowRunStep = {
  /** The step's position in the saved draft: what the model and the attempt's row call it. */
  position: number;
  label?: string;
  ran: "passed" | "failed" | "skipped" | "not_reached";
  happened?: string;
  /**
   * Why a skipped step was passed over, in Core's closed words (`./steps-ran.ts`): an act already
   * done, a control already in its asked state, a sometimes-present step whose control was not there
   * (`absent`, or `absent_not_done` when what it does was not done), a page that never arose, or the
   * page routing the run to another step. What a replay is accepted on reads it (`../completion/`).
   */
  skipped?: AutomationStudioAnswerFirstFlowRunSkip;
  /** A check only a person could clear met this step, and the run went on after they cleared it. */
  personCleared?: true;
  /**
   * Each cleared check, with an unknown outcome when no valid engine branch was recorded. A rerun's link
   * names only the immediately following successful attempt of the same node/definition/frame.
   * It grants no replay exception and says nothing yet about executable/input identity.
   */
  personClearances?: {
    attemptId: string;
    resolution: NonNullable<AutomationStudioNodeAttemptTrace["personContinuation"]> | { kind: "unknown" };
    rerunAttemptId?: string;
  }[];
  /** Attempts the step took past its first, over every pass of it. Absent when none. */
  retries?: number;
};

/** The closed reasons a run passed a step over (`AutomationStudioAnswerFirstFlowRunStep.skipped`). */
export type AutomationStudioAnswerFirstFlowRunSkip = "already_done" | "already_in_state" | "absent" | "absent_not_done" | "not_arisen" | "routed_elsewhere";

export type AutomationStudioAnswerFirstFlowRunOutcome =
  /** The saved steps do not make a Flow that can run. Nothing was asked and nothing was sent. */
  | { kind: "not_assembled"; codes: readonly string[] }
  /** A person said no, or there is nobody to say yes. Nothing was sent. */
  | { kind: "permission_declined"; consequences: readonly string[] }
  /** A step is outside the caller's scope (`../caller/replay-scope.ts`), said in Core's words. Nothing was asked and nothing was sent. */
  | { kind: "outside_scope"; said: string }
  /** A person's Stop. */
  | { kind: "stopped" }
  | {
    kind: "ran";
    /** The Flow ran from its start to its end. Whether that is the person's result is the judge's. */
    reachedEnd: boolean;
    /** Exact current saved source/executable correspondence only; no input-frame proof or replay exemption. Absent legacy metadata is unknown. */
    executableSource?: AutomationStudioAnswerFirstExecutableSource;
    /** Every step of the Flow, by position. A step left out of the plan is absent. */
    steps: AutomationStudioAnswerFirstFlowRunStep[];
    /** Where it stopped, whenever it did not reach the end. */
    failing?: { position: number; label?: string; happened: string; code?: string; pageNow?: { page?: string } };
  };
