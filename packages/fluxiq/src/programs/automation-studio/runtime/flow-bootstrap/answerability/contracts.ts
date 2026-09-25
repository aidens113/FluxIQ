// Whether the Flow a build wrote could answer the instruction at all, and what
// a refusal tells the model.
//
// The vocabulary here is about *capability*, never about a chain of steps. Two
// live builds answered "Search the catalog for 'lamp' and scrape every product
// the search returns" with four steps and two others with two steps; both are
// legitimate routes, and a Flow that reaches a search by URL instead of typing
// into a field is not wrong. What is not a route at all is a Flow that cannot
// produce what the sentence asked for under any reading: `run-mug5jixm-5aab19a3`
// navigated twice, typed three times, read nothing, and was proposed as
// finished with its extraction recorded `status: "not_run"`. That is knowable
// from the plan and the instruction alone, without a model call, and it is the
// only thing judged here.
//
// A record and a column are the same domain-neutral words
// `runtime/result-verification/` judges a finished run's result in -- a row of
// values with named fields is what any medium's extraction produces -- so this
// is that judgement moved one step earlier, to a plan that has no result yet.
// It is made from Core's own reading alone, because a build that is fine must
// not get slower or dearer: nothing here calls a provider.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";

/** What the instruction plainly asks to be given back, read from its own words. */
export type AutomationStudioFlowBootstrapInstructionAsk = {
  /** True when the instruction plainly asks for a set of records. */
  records: boolean;
  /** The person's own sentence that asks for them, bounded. Absent when none does. */
  quote?: string;
  /** The columns the instruction named, in the order it named them. */
  columns: string[];
};

/** What the Flow a build wrote can do with a set of records, read off the plan. */
export type AutomationStudioFlowBootstrapPlanRecordSets = {
  /** Keys of the steps whose own result carries rows, by the records path their definition declares. */
  returning: string[];
  /** Keys of the steps that name a dataset to save rows into. */
  storing: string[];
  /** Every step's definition id, in authored order: what the Flow can do at all. */
  steps: string[];
};

/**
 * Whether the plan may be proposed, or what the model is told instead.
 *
 * A refusal is not the end of a build. It is fed back exactly as a refused
 * parameter is, and the exploration asks again on the same budget, cost and
 * no-progress guards -- so nothing here can spin.
 */
export type AutomationStudioFlowBootstrapAnswerability =
  | { ok: true }
  | {
    ok: false;
    /** The issue that refuses the completed plan. */
    issue: AutomationStudioFlowBootstrapIssue;
    /** What the instruction asks for and what the Flow lacks, as the model is shown it. */
    cannotAnswer: JsonObject;
    /** What to do about it, in Core's own words. */
    instruction: string;
  };
