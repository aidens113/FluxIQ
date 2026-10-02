// The loop ran out of turns: what it was allowed, what it used, and how far the
// draft had got when the allowance ended.
//
// **Running out is not a bad answer, and must never be reported as one.** Until
// 2026-09-28 an exhausted loop whose last paid decision had been refused ended
// as that refusal instead: `exhausted()` called `unusableDecisions.stalled`,
// which Flow Bootstrap builds as
// `flow_bootstrap.evidence_unusable_decision` -- "the model kept answering with
// something the exploration could not use" -- at stage
// `provider_output_validation` and `retryable: false`. On
// `run-mulryg6h-ff241a12` that was the whole account of a build which explored
// competently for thirteen decisions, hit one extraction that failed three
// times, and then simply used its twenty-sixth call. Nothing was validated,
// the provider's output was never the problem, and a larger budget is exactly
// what the run needed -- so the one field a reader acts on said the opposite of
// the truth, and a debug of that run spent hours inside the completion checks
// before reaching the `for` loop's fall-through. Had iteration 26 happened to
// be a tool call rather than a refused completion, the identical run would have
// reported `flow_bootstrap.evidence_iteration_limit`.
//
// So an exhausted loop now always ends `llm_evidence_loop.iteration_limit`, and
// carries this record with it. The last refusal is not lost -- it travels as
// `lastIssueCodes`, and the diagnostic publishes it as `issueCodes` -- but it is
// carried as context for an ending, not mistaken for the cause of one.
//
// Counts and closed words only, like every other record this loop publishes.
// Nothing the model wrote and nothing a page returned passes through here.
//
// The record is built here as well as declared
// (`automationStudioLlmEvidenceLoopExhaustion`), so the arithmetic behind each
// count sits beside the field it fills. It was built inline in the
// coordinator's loop body until that file passed Core's 800-line limit (t226).

import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmBuildPurseRefusal } from "../build-purse/index.ts";

/** Which allowance ran out. Each is a number a retry can raise. */
export type AutomationStudioLlmEvidenceLoopExhaustedBound =
  /** `maxIterations`: the loop reached the last turn it was configured for. */
  | "iterations"
  /**
   * The run's own budget (`loop-budget.ts`) had no decision left, so the loop
   * stopped before asking for one it could not pay for -- including the last
   * decision, which is offered only completion and spent on something else.
   */
  | "budget"
  /** `maxToolCalls`: the loop had turns left but no allowance to run anything with them. */
  | "tool_calls";

/**
 * What an exhausted loop has to say for itself.
 *
 * The first two answer "was this budget the problem?"; the rest answer "how
 * close was it?" -- a build that stopped one proposable step short of a plan
 * reads very differently from one that never appended an action, and before
 * this record the two were the same sentence.
 */
export type AutomationStudioLlmEvidenceLoopExhaustion = {
  bound: AutomationStudioLlmEvidenceLoopExhaustedBound;
  /** Decisions the loop was allowed. */
  maxIterations: number;
  /** Decisions it used. */
  iterations: number;
  /**
   * Steps the draft held when the allowance ran out, seeded ones included.
   *
   * **What this and the next field are for, and what is still missing.** A build
   * that exhausts writes no Flow: the completion check refused every attempt it
   * made, so there is no plan Core has agreed could answer the instruction, and
   * publishing the draft anyway would publish a Flow Core itself says cannot
   * run. That much is right. What is not is that the draft goes with it, so the
   * next attempt pays again for navigation this one had already proved -- on
   * `run-mulryg6h-ff241a12`, six actions that moved the page, a structure
   * detection and two inspections. The loop does hand the draft back on its
   * failed result (`./result.ts`, `steps`); `runtime/service.ts` drops it.
   *
   * Resuming from it needs somewhere to keep a partial draft, a rule for what a
   * partial draft is to the rest of Core, and a build path that seeds from one
   * (`../loop-configuration.ts`'s `draft.seed`, which an extend build already
   * uses). Until that exists these two counts are what says how much was lost,
   * so the cost is at least measurable instead of invisible.
   */
  draftSteps: number;
  /**
   * How many of those a Flow could actually be proposed from: kept, and
   * proposable, counted exactly as an amendment's `keptStepCount` is. This is
   * the number that says whether the work is worth resuming -- a draft of
   * thirteen steps none of which can be proposed is not nearly a Flow.
   */
  proposableSteps: number;
  /** Times the model asked to finish. Zero means it never tried. */
  completionAttempts: number;
  /**
   * The issue codes that refused the last decision, where the last one was
   * refused. Empty when the loop ran out after a decision it could use, which
   * is the ordinary case and the one that used to be reported honestly.
   */
  lastIssueCodes: readonly string[];
  /**
   * Which of the run's budget bounds had no decision left, when `bound` is
   * `budget`: the one whose count of decisions left was smallest
   * (`../loop-budget.ts`). Absent for the other bounds.
   *
   * `run-mulx76vv-a882551e` ended `budget` with $0.06 of a $0.25 cost cap spent
   * and 527,633 of 600,000 tokens, and the debug had to compute from the trace
   * that it was the tokens; this says so.
   */
  budgetBound?: AutomationStudioLlmEvidenceLoopBudgetBound;
  /**
   * The issue codes of the last completion refusal the model had not yet
   * answered with another attempt to finish, whatever came after it. Empty when
   * it never tried, or its last attempt was not refused.
   *
   * What a continuation of this build is told it still owes
   * (`../../flow-bootstrap/incomplete-draft/`), which `lastIssueCodes` cannot say:
   * that one empties the moment any usable decision follows the refusal.
   */
  outstandingIssueCodes: readonly string[];
  /**
   * The decision the cost budget declined, when that is what ended the loop
   * (`./cost-purse.ts`): what was spent, what the next decision would have
   * cost at worst, and the ceiling it would have crossed. `budgetBound` is then
   * `cost`. The decision was never sent, so `iterations` does not count it.
   *
   * Either the purse refused it, or the loop's count of decisions left
   * (`../loop-budget.ts`) found none it could pay for before the decision
   * reached the purse (`declinedBy: "loop_budget"`): its figure is then the
   * last decision's worst case, the least the next can cost at worst. The
   * second used to carry nothing, so `run-muqbzu32-8691a65e` stopped at $0.074
   * of $0.10 and told the person no figure at all (t194-w47).
   */
  costRefusal?: AutomationStudioLlmBuildPurseRefusal;
};

/** A budget bound that can run out, as `../loop-budget.ts` counts them. */
export type AutomationStudioLlmEvidenceLoopBudgetBound = "iterations" | "tokens" | "cost" | "duration";

/**
 * What an exhausted loop has to say for itself, read off the loop's state at
 * the moment its allowance ran out. Shared by every allowance that can run
 * out: the budget's at the top of an iteration, the tool-call ceiling, and the
 * literal max-iteration exit.
 */
export function automationStudioLlmEvidenceLoopExhaustion(state: {
  bound: AutomationStudioLlmEvidenceLoopExhaustedBound;
  maxIterations: number;
  iterations: number;
  draftSteps: readonly AutomationStudioFlowDraftStep[];
  completionAttempts: number;
  /** Unusable decisions in the current unbroken run of them; zero when the last decision was usable. */
  unusableInARow: number;
  /** The issues of the latest unusable decision, whether or not the run of them is still unbroken. */
  lastIssueCodes: readonly string[];
  /** Which budget bound had the fewest decisions left when the budget was last read, where it was. */
  lastRemaining: { limitedBy: AutomationStudioLlmEvidenceLoopBudgetBound } | undefined;
  /** The call the build's purse refused, or its standing where it refused none (`./cost-purse.ts`). */
  purseRefusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  outstandingIssueCodes: readonly string[];
}): AutomationStudioLlmEvidenceLoopExhaustion {
  const { bound, lastRemaining } = state;
  // The purse's refusal ends the loop on cost whatever the count said; its
  // standing is the cost figures only where cost is the bound the count ran out of.
  const purseRefusal = state.purseRefusal && (state.purseRefusal.declinedBy === undefined || lastRemaining?.limitedBy === "cost") ? state.purseRefusal : undefined;
  return {
    bound,
    maxIterations: state.maxIterations,
    iterations: state.iterations,
    draftSteps: state.draftSteps.length,
    // Counted exactly as an amendment's `keptStepCount` is, so the last row
    // of the trace and the ending cannot disagree about how much plan there
    // was: kept, and proposable.
    proposableSteps: state.draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
    completionAttempts: state.completionAttempts,
    // Only while the run of refusals is unbroken. A loop that ran out after a
    // decision it could use has no last refusal, and reporting the one before
    // it would be the same conflation in a smaller field.
    lastIssueCodes: state.unusableInARow ? [...state.lastIssueCodes] : [],
    ...(bound === "budget" && lastRemaining ? { budgetBound: purseRefusal ? "cost" as const : lastRemaining.limitedBy, ...(purseRefusal ? { costRefusal: { ...purseRefusal } } : {}) } : {}),
    // What a continuation of this build is told it still owes.
    outstandingIssueCodes: state.outstandingIssueCodes
  };
}
