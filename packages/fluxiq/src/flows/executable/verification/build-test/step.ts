import type { BuildTestLanding } from "./landing.ts";
import type { BuildTestPass } from "./pass.ts";
import type { JsonValue } from "@fluxiq/contracts/core";

/**
 * One step of the Flow a build proposes, as the judge of its test reads it.
 *
 * `target` and `observed` are the domain's words and evidence, screened by the
 * builder (`build-test/summary.ts`) and checked again before sending
 * (`llm/harness/request-evidence-check.ts`). `claims` are the model's own and
 * prove nothing.
 */

export type BuildTestStep = {
  /** The step's position in the draft, the number the repair is told. */
  step: number;
  /** What was done, under the caller's own name for it. */
  action: string;
  /** The step's own words from what it ran with, then what it was given: the name or text of what it acted on, the item, the option, the typed text. */
  target?: string[];
  /** The acts the step, or the build's result, names it for. Claims, not proof. */
  claims?: string[];
  /** How the step answered in this test. `not_run` when the test did not run it, or did not run at all. */
  outcome: "replayed" | "verified" | "present" | "remembered" | "failed" | "changed" | "unreproducible" | "not_run";
  /** Set when the step's effect lasts and the test only checked it rather than doing it again. */
  withheld?: true;
  /** The position of the checked step before this one whose withheld effect this step may have needed. */
  withheldBy?: number;
  /**
   * On a step that changes nothing (a read) that ran after checked steps whose
   * act the test left undone -- `verified` on the step or on any pass, not
   * `present`, which was already in place -- their positions, in order. The
   * read saw a page without what those acts make (a status they set, a row they
   * add), so rows missing for that reason are the test's, not the Flow's (run
   * `run-muw6144a-e56f945d`, C1).
   */
  afterWithheld?: number[];
  /**
   * Set on a step that did not hold in this test and that the Flow passes
   * over as written, saying why in Core's words ("optional: ...; in this test
   * it did not run, which does not stop the Flow"). Not a defect: it is why the
   * test passed with it (`../flow-draft/excused.ts`).
   */
  excused?: string;
  /** When the step runs, when it is not simply the next thing: optional, only if, on failure, or repeated over another step. */
  runs?: JsonValue;
  /** Set when the step was carried from an earlier Flow rather than run in this build. */
  carried?: true;
  /** What the test observed for this step: the rows a read returned, or a check's answer. */
  observed?: JsonValue;
  /** What the step did while the build explored, for a step the test only checked. */
  explored?: { changed: "yes" | "no" | "unknown"; resultCode?: string; stateChanged?: boolean; landed?: BuildTestLanding };
  /**
   * A repeated step's passes, one per row of the list its span repeats over,
   * in order (t252 D6). `outcome` above is the first pass that did not pass,
   * else `replayed`; each pass's own answer and observation are here.
   */
  passes?: BuildTestPass[];
};
