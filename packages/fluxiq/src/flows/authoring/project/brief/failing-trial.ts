import type { FailedVerdict } from "./failed-verdict.ts";
import type { JsonObject } from "../../../../core/index.ts";

/**
 * A repair's failing trial as Core read it (header): a trial that did not
 * pass, or one that passed only on the run's own recovery from interruptions
 * the Flow does not answer, each named under `interruptions`.
 */
export type AutomationStudioProjectFailingTrial = {
  verdict: FailedVerdict;
  /** The last step that failed, as the trial's own steps name it: its number, label, node, failure code and what happened. Absent when no step failed. */
  failedStep?: JsonObject;
  /** Everything else the trial said -- its code, what happened, what its judge read -- bounded. */
  said: JsonObject;
} | {
  verdict: "yes";
  /**
   * Each step where the run recovered by itself from what the Flow does not
   * answer (header): its number, label and control, what the site did and how
   * the run recovered (`absorbed`, `interruptions`, `learned`), and what the
   * Flow needs there (`needs`), each bounded.
   */
  interruptions: JsonObject[];
  said: JsonObject;
};
