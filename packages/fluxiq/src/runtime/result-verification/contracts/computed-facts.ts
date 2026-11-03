// What Core settles about a result before any judge is asked (framework plan
// P5, contract K4): computed facts.
//
// A fact is something Core measured in its own record of the run -- a count, a
// column, a repeated row, a cell, a bound, an order, a left-out row's stated
// exclusion, a pass of a requested act -- never a reading of a model's reply.
// A fact Core cannot compute is omitted, and the judge is asked as before (the
// K4 default). A fact that `fails` carries the defects Core located, in the
// judge's own defect shape (`../../llm/verification-defects/`), so a repair
// reads a Core no exactly as it reads a judge's located no. A fact that
// `holds` is said to the judge as settled, and no judge is asked to decide it
// again. A fully computed pass is still not a yes: only a model yes passes.

import type { AutomationStudioRunResultSummary } from "./run-result-summary.ts";
import type { AutomationStudioResultRequestedOutput } from "./requested-output.ts";

/** The facts Core computes, one kind per module of `../computed-facts/`. */
export type AutomationStudioResultComputedFactKind =
  | "count"
  | "columns"
  | "repeated"
  | "verbatim"
  | "kept_bounds"
  | "left_out_accounted"
  | "order"
  | "act_passes";

/**
 * One defect Core located in its own record, in the shape a judge's
 * `diagnosis.defects` entry takes (`../../llm/verification-defects/schema.ts`):
 * the closed kind, the row (its label as Core's record says it, or the step for
 * an act), an optional column, value and step, and the request's words it is
 * held to. `requestWords` is always the request's own text (a phrase that runs
 * in it), or, where the defect is that the request states nothing for it, the
 * clause of the request the row falls under.
 */
export type AutomationStudioResultComputedDefect = {
  kind: "kept_not_asked" | "asked_missing" | "wrong_value" | "act_missing" | "act_wrong" | "other";
  row: string;
  column?: string;
  value?: string;
  step?: string;
  requestWords: string;
};

/**
 * One computed fact. `said` is Core's sentence for it, in generic words that
 * name no site or scenario, bounded, read by the judge (a fact that holds) and
 * by the builder and the person (a fact that fails). `defects` is present, and
 * not empty, exactly when `status` is `fails`.
 */
export type AutomationStudioResultComputedFact = {
  kind: AutomationStudioResultComputedFactKind;
  status: "holds" | "fails";
  said: string;
  defects?: AutomationStudioResultComputedDefect[];
};

/** What every fact is computed from: the summary the judge would be shown, the request, and what the build declared it owes. */
export type AutomationStudioResultComputedFactsInput = {
  summary: AutomationStudioRunResultSummary;
  /** The request, as the Flow's own instructions state it (what `../request-rows/request-wording.ts` reads). */
  instructions: ReadonlyArray<{ title: string; body: string }>;
  /** The request's text: each instruction's title and body, joined by new lines, as `../verify.ts` builds it. */
  requestText: string;
  /** What the build declared it owes, where the caller holds it outside the summary's task checklist (t757). */
  requestedOutput?: AutomationStudioResultRequestedOutput | undefined;
};

/** One fact's computation: the facts it could compute (none where it could compute none). */
export type AutomationStudioResultComputedFactCheck = (input: AutomationStudioResultComputedFactsInput) => AutomationStudioResultComputedFact[];
