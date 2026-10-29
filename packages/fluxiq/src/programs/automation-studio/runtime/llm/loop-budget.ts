// What an evidence loop has left to spend, and what the model is told of it.
//
// A build used to stop at a call count: 26 decisions, whatever it had left, and
// with the evidence total no longer binding, realistic builds on the Week 2
// sites walked filters and pages right up to that count and ended
// `evidence_iteration_limit` without writing a Flow (`run-mubs2sme-75efe4a4`,
// `run-mubri4yg-10d01258`). Nothing had told the model that its decisions were
// running out, so it never planned to finish. The count was also the wrong
// bound: the standing decision is that a loop iterates while it makes progress
// and stops on a guard that means something -- the run's cost, its token
// budget, its deadline, or the no-progress guard -- with a call count only a
// far-away backstop.
//
// So a loop given a budget works out, before every decision, how many more
// decisions each bound leaves it, from what it has actually spent, and the
// smallest of them is what it has left. The model is told, in closed numbers,
// as the newest evidence entry. When one decision is left a draft is offered
// only completion; a candidate keeps submission and trial because finishing
// requires them. Neither runs further exploration (a candidate's exploring
// tools stay listed, and are answered unrun: below, t503).
//
// Tokens are read from each decision's reported usage. A decision the caller
// could not use reports none, so it is counted at the loop's average; and one
// decision's worth is held back for calls the loop cannot see that spend the
// same run budget, such as the build's one reading of its instructions.
//
// **Cost is counted, never enforced, here (t234).** The purse
// (`./build-purse/purse.ts`, held through `./evidence-loop/cost-purse.ts`) is
// the only cost authority: before each decision is sent its own worst case is
// priced from its request, and one the purse cannot pay for is never sent --
// the only way a loop ends on cost. The cost count reads that same purse --
// what is spent, the earlier builds of the same Flow creation included, and
// what is in flight -- holds nothing back, and is never less than one: it tells
// the model what is left and when to wrap up, and leaves the deciding to the
// purse. It used to hold back an extra average decision and count to zero on
// its own, and `run-muqbzu32-8691a65e` stopped with $0.0738 of $0.10 spent and
// a next decision of $0.0245 at worst that the purse would have paid for.
//
// **What judging needs is not the exploration's to spend (t254).** A build
// with a judge keeps its judging pair back from every decision
// (`./build-purse/purse.ts`, `keepBackForJudging`), and the count takes it out
// of what is left: the model is told what exploration may still spend, and
// reaches its wrap-up while the decision that finishes and the judging after
// it are both still paid for. `run-murzln6g` was told of $0.0111 it could not
// have spent on a repair and judged.
//
// **The last decisions are for finishing, not only the very last one.** The
// last decision used to be the only one offered completion alone, so a
// completion refused on it had no turn left to be corrected:
// `run-mulxsbyy-d4d4c7a1` was refused on its forced final decision and ended
// with nothing. From `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS`
// decisions left, the loop stops offering new tools and offers completion and
// amendments, so a refusal still has two decisions to be answered in -- one to
// amend what it names, one to finish again -- before the last.
//
// **A candidate's wrap-up keeps the tools that finish it (t383).** In candidate
// mode (`discoveryOnly`) completing needs a submitted revision and, where a
// trial runs, a yes for it, so a wrap-up that offered no tools withdrew
// `core.submit_candidate` and made every completion fail:
// `run-mv0pa79q-ef91811b` explored until three decisions were left, never
// submitted, and spent all four of its last decisions on completions refused
// `candidate.latest_submission_required`. So a candidate's wrap-up offers its
// submission and its trial beside completion, and starts at
// `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS`: a submit,
// its trial and the completion, with one more submit and trial for a refusal.
// Finishing tools stay available through the last counted decision: cost is
// guidance, and the purse may still pay for testing and then completion.
// Lane B `run-mv4jqkko-bc9a05c6` lost its trial with an untested receipt and
// was forced into a completion the trial gate correctly refused.
//
// **A candidate's wrap-up keeps its tool list (t503, W6).** It used to offer
// only the finishing tools, which rebuilt the tools and the decision schema at
// the head of the request: lane C round 17 (`run-mv6lgqi6-4bfab2e1`, 0051)
// cached 1,664 of 86,040 input tokens on its first wrap-up decision, $0.0131
// and a fifth of the build, the prefix broken where the schema's tool list
// shrank from eight tools to two. So a candidate's wrap-up offers every tool
// it offered before and withholds the exploring ones where a call is
// dispatched (`withholds`, `./evidence-loop.ts`: answered `not_offered`, never
// run). The withdrawal is said in the budget entry, which rides after the
// window, so the head of the request does not change. A draft loop's wrap-up
// still offers no tools: its schema then holds completion and amendments
// only, which is what makes it finish.
//
// **A candidate's wrap-up runs a targeted undo (t741, t775).** A trial
// refused `trial_starts_in_end_state` will not run until the build undoes the
// one act it names, and an undo is a `core.run_node` naming the act under `undoes`. The
// wrap-up judged only the tool id, so it withheld every `core.run_node`, the
// undo with it: photo `run-mvgobp8h-b99ede98` (0150-0158) had its undos
// answered `not_offered`, its trial refused again, and never tried its last
// revision. So `withholds` judges the call: a `core.run_node` whose input names
// an act id under `undoes` runs; one without it explores and is withheld. A
// draft loop's wrap-up still withholds every call.
//
// **A loop may count calls too (t570).** A subflow builder spends a share of
// the build's calls carved for its brief (`./build-purse/allowance-book.ts`),
// and each trial it makes spends its judge's calls from that same share. With
// nothing counting them its wrap-up came only from its iterations, and on A8
// round 1 a builder's share ran out first: refused
// `llm_budget.run_call_limit` before it ever submitted. A budget that names
// `countCalls` counts the calls its purse can still hold
// (`purse.callsLeft`), less the calls it keeps for its finishing trials'
// judges, as one more bound: one decision is one call, a trial's judge calls
// leave the count as they are spent, and the wrap-up starts while a
// submission, its trial and the completion still fit. As with cost the count
// is never none: the purse decides. A budget without it -- every candidate
// build's -- counts as before.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudgetBound } from "./evidence-loop/index.ts";

/**
 * Decisions left from which the loop offers only completion and amendments:
 * the wrap-up. Three, so a completion refused on the first of them has one
 * decision to amend and one to finish again.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS = 3;

/**
 * Decisions left from which a candidate loop offers only finishing: submitting,
 * testing and completing. Five: a submission, its trial and the completion,
 * and one more submission and trial for a refusal or a failed trial.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS = 5;

/**
 * The two tools a discovery-only loop finishes with: the one that submits its
 * result and the one that tries it. A loop names its own (`finishingTools`, a
 * subflow builder's `core.submit_subflow` and `core.test_subflow`; t537), and
 * the wrap-up keeps exactly those running and names them in its words.
 */
export type AutomationStudioLlmEvidenceFinishingTools = { submit: string; test: string };

/**
 * The tools that finish a candidate (`../flow-bootstrap/candidate/authoring-loop.ts`
 * and `trial-gate.ts` beside it), named as plain strings so this module does
 * not reach into the candidate loop: every loop's finishing tools unless it names its own.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_CANDIDATE_FINISHING_TOOLS: Readonly<AutomationStudioLlmEvidenceFinishingTools> = Object.freeze({ submit: "core.submit_candidate", test: "core.test_candidate" });
export const CANDIDATE_FINISHING_TOOL_IDS: ReadonlySet<string> = automationStudioLlmEvidenceFinishingToolIds();

/** The run tool and the key its undo names an act under, as plain strings so this module reaches into neither `./node-tools/` nor `../flow-bootstrap/site-reset/`. */
const RUN_NODE_TOOL_ID = "core.run_node";
const UNDOES_KEY = "undoes";
/** The act ids `../flow-bootstrap/site-reset/undoes-tool.ts` accepts under `undoes`. */
const ACT_ID = /^act-[1-9][0-9]{0,3}$/u;

/** Whether a call undoes one of the build's own acts: a run naming an act id under `undoes` (header, t741). */
function undoesAnAct(toolId: string, input: unknown): boolean {
  if (toolId !== RUN_NODE_TOOL_ID || typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const undoes = (input as Record<string, unknown>)[UNDOES_KEY];
  return typeof undoes === "string" && ACT_ID.test(undoes);
}

/** The ids of a loop's finishing tools, the candidate's when it names none. */
export function automationStudioLlmEvidenceFinishingToolIds(tools: AutomationStudioLlmEvidenceFinishingTools = AUTOMATION_STUDIO_LLM_EVIDENCE_CANDIDATE_FINISHING_TOOLS): ReadonlySet<string> {
  return new Set([tools.submit, tools.test]);
}

/** The bounds a loop is given, each optional. */
export type AutomationStudioLlmEvidenceLoopBudget = {
  /** The run's whole token budget. */
  maxTotalTokens?: number;
  /** The most one decision may use. The run's budget refuses a call once less than this is left. */
  maxTokensPerDecision?: number;
  /** The run's cost ceiling, held against what decisions report having spent. */
  maxCostUsd?: number;
  /** How long the loop may run from its start. */
  maxDurationMs?: number;
  /** The clock; `Date.now` when absent. */
  now?: () => number;
  /**
   * Count the calls the purse can still hold as a bound (header, t570),
   * keeping `keptForFinishing` of them back for the judges of the trials the
   * wrap-up makes. Absent, calls are not counted here: the purse refuses a
   * call past its cap, as before.
   */
  countCalls?: { keptForFinishing: number };
};

/** What the loop has spent so far. */
export type AutomationStudioLlmEvidenceLoopSpending = {
  /** Decisions asked for, usable or not. */
  decisions: number;
  /** Decisions whose usage was reported and counted below. */
  reportedDecisions: number;
  totalTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  /**
   * The worst case of the last decision sent, priced from its request
   * (`./build-purse/`): every input token uncached, its reply at its reserve.
   * Each request carries everything before it, so the next costs at least this
   * at worst. The next decision is reserved at this or the average, whichever
   * is larger, and the rest are counted at the average: the average alone said
   * three decisions were left on `run-mup2u8o3-6697c4be` when the next one
   * alone could cost $0.15, and this alone for every decision withdrew tools
   * with $0.09 left on `run-muq3uozx-3153564b` when calls cost $0.003.
   */
  nextDecisionCostUsd?: number;
  /**
   * The purse the loop's decisions are held against, read before this
   * decision: the cost count reads it rather than the loop's own figures, so
   * what earlier builds of the same Flow creation spent, what calls in
   * flight are held at and what is kept back for judging the Flow
   * (`keptBackUsd`, t254) count, and nothing else is held back. Absent, the
   * count reads `maxCostUsd` and `estimatedCostUsd`.
   */
  purse?: { ceilingUsd: number; spentUsd: number; pendingUsd: number; keptBackUsd?: number; callsLeft?: number };
};

/** What is left, this decision included. Only the bounds the budget names appear. */
export type AutomationStudioLlmEvidenceLoopRemaining = {
  decisionsLeft: number;
  /**
   * The bound that left the fewest decisions, and so the one that ends the
   * loop if nothing changes -- unless it is cost, which never ends a loop on
   * its count: the purse does, by refusing a decision. Recorded on an
   * exhausted loop so a reader need not work out from the trace which of
   * tokens and time it was (`./evidence-loop/exhaustion.ts`). Never shown to
   * the model.
   */
  limitedBy: AutomationStudioLlmEvidenceLoopBudgetBound;
  tokensLeft?: number;
  costLeftUsd?: number;
  secondsLeft?: number;
  /** The calls the purse can still hold, when the budget counts calls (header, t570). */
  callsLeft?: number;
};

/** Floating-point slack, as the purse allows, so money for exactly one worst case counts it. */
const COST_EPSILON_USD = 1e-9;

/** The evidence entry the remaining budget is shown under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID = "core.budget";

const BUDGET_INSTRUCTION = "What this exploration has left, this decision included. Plan to complete while it is enough: running out ends the exploration without a result.";
const FINAL_INSTRUCTION = "This is your last decision, so only complete is offered: write the result now from the evidence you have.";
const WRAP_UP_INSTRUCTION = "Only a few decisions are left, so new tools are no longer offered: complete now from the draft you have. If completing is refused, amend the draft as the refusal says and complete again.";
const CANDIDATE_BUDGET_INSTRUCTION = `What this exploration has left, this decision included. Plan to finish while it is enough: submit the whole candidate, test that revision, and complete once its trial answers yes. From ${AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS} decisions left only those run, and running out ends the exploration without a result.`;
function candidateFinalInstruction(tools: AutomationStudioLlmEvidenceFinishingTools): string {
  return `The budget counts one decision left; submitting, testing and completing are still offered while the budget permits. If the latest submission is untested, test its exact revision and digest now with ${tools.test}. Complete only after that exact revision's trial answers yes, or no trial runner is available. Never complete an untested revision when a trial runner is available.`;
}
function candidateWrapUpInstruction(tools: AutomationStudioLlmEvidenceFinishingTools): string {
  return `Only a few decisions are left, so only ${tools.submit}, ${tools.test} and completing run now: every other tool is still listed, but a call to one is answered without running and spends a decision. A call that names one of this build's own lasting acts under undoes still runs. If your latest Flow is not submitted, submit the whole candidate now with ${tools.submit}; test that exact revision with ${tools.test}; complete with its revision and digest once the trial answers yes. If a submission or a trial is refused, correct what it names, submit again and test the new revision.`;
}

/** Decisions left from which the loop wraps up: a candidate's wrap-up starts earlier, since it has a submission and a trial to make before it completes. */
function wrapUpDecisions(candidate: boolean): number {
  return candidate ? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS : AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS;
}

/**
 * Whether this decision is in the wrap-up, the tools it offers, and whether a
 * call to a tool is one the wrap-up withholds. Outside the wrap-up every
 * eligible tool is offered. In it, a draft loop offers none; a candidate loop
 * (`candidate`, the loop's `discoveryOnly`) still offers every eligible tool,
 * so the head of its request is unchanged (header, t503), and withholds all
 * but its submission, its trial and a run that undoes one of its acts
 * (header, t741) through its last counted decision. `withholds` judges the
 * call: its tool and, where given, its input. The
 * purse and hard bounds still decide whether another decision can run; the
 * trial gate still owns success.
 */
export function automationStudioLlmEvidenceLoopWrapUp<Tool extends { toolId: string }>(input: {
  remaining: AutomationStudioLlmEvidenceLoopRemaining | undefined | false;
  canComplete: boolean;
  candidate: boolean;
  tools: readonly Tool[];
  /** The candidate loop's finishing tools, which its wrap-up keeps running; the candidate's own when absent. */
  finishing?: AutomationStudioLlmEvidenceFinishingTools | undefined;
}): { wrappingUp: boolean; offered: Tool[]; withholds: (toolId: string, input?: unknown) => boolean } {
  const left = input.remaining ? input.remaining.decisionsLeft : undefined;
  const wrappingUp = left !== undefined && left <= wrapUpDecisions(input.candidate) && input.canComplete;
  const offered = !wrappingUp || input.candidate ? [...input.tools] : [];
  const runs: ReadonlySet<string> = input.candidate ? automationStudioLlmEvidenceFinishingToolIds(input.finishing) : new Set();
  return { wrappingUp, offered, withholds: (toolId, call) => wrappingUp && !runs.has(toolId) && !(input.candidate && undoesAnAct(toolId, call)) };
}

/** How many decisions each bound still allows, and the smallest of them with `decisionsLeft` from the iteration backstop. */
export function automationStudioLlmEvidenceLoopRemaining(budget: AutomationStudioLlmEvidenceLoopBudget, spent: AutomationStudioLlmEvidenceLoopSpending, iterationsLeft: number): AutomationStudioLlmEvidenceLoopRemaining {
  const unreported = Math.max(0, spent.decisions - spent.reportedDecisions);
  const averageTokens = spent.reportedDecisions ? spent.totalTokens / spent.reportedDecisions : budget.maxTokensPerDecision ?? 0;
  const averageCost = spent.reportedDecisions ? spent.estimatedCostUsd / spent.reportedDecisions : 0;
  const counts: Array<[AutomationStudioLlmEvidenceLoopBudgetBound, number]> = [["iterations", iterationsLeft]];
  const remaining: Omit<AutomationStudioLlmEvidenceLoopRemaining, "decisionsLeft" | "limitedBy"> = {};
  if (budget.maxTotalTokens !== undefined) {
    // Unreported decisions at the average, and one more held back.
    const tokensLeft = budget.maxTotalTokens - spent.totalTokens - (unreported + 1) * averageTokens;
    const perDecision = budget.maxTokensPerDecision ?? averageTokens;
    counts.push(["tokens", tokensLeft < perDecision ? 0 : 1 + Math.floor((tokensLeft - perDecision) / Math.max(1, averageTokens))]);
    remaining.tokensLeft = Math.max(0, Math.floor(tokensLeft));
  }
  if (budget.maxCostUsd !== undefined || spent.purse) {
    // What the purse has left for decisions: its ceiling less what is spent,
    // what is in flight and what is kept back for judging, with nothing else
    // held back. Without one, the loop's own figures.
    const costLeft = spent.purse
      ? spent.purse.ceilingUsd - spent.purse.spentUsd - spent.purse.pendingUsd - (spent.purse.keptBackUsd ?? 0)
      : budget.maxCostUsd! - spent.estimatedCostUsd - unreported * averageCost;
    // As the token bound counts: the next decision is reserved at its worst
    // case, once, and those after it at what decisions have actually cost.
    // Counting every one at the worst case withdrew tools with $0.09 left when
    // calls cost a tenth of it (`run-muq3uozx-3153564b`). Before anything is
    // reported, the worst case is the only price known.
    const worstCase = Math.max(averageCost, spent.nextDecisionCostUsd !== undefined && Number.isFinite(spent.nextDecisionCostUsd) ? spent.nextDecisionCostUsd : 0);
    const perDecision = spent.reportedDecisions ? averageCost : worstCase;
    const counted = costLeft <= 0 || costLeft + COST_EPSILON_USD < worstCase ? 0 : perDecision > 0 ? 1 + Math.floor((costLeft - worstCase + COST_EPSILON_USD) / perDecision) : iterationsLeft;
    // Never none: the decision is sent and the purse decides. At one, the loop
    // offers finishing, never exploration; it does not end there
    // (`./evidence-loop.ts`).
    counts.push(["cost", Math.max(1, counted)]);
    remaining.costLeftUsd = Math.max(0, Math.floor(costLeft * 10_000) / 10_000);
  }
  if (budget.countCalls && spent.purse?.callsLeft !== undefined) {
    // One decision is one call; the finishing trials' judges are kept back. Never none: the purse decides.
    const callsLeft = Math.max(0, spent.purse.callsLeft);
    counts.push(["calls", Math.max(1, callsLeft - Math.max(0, budget.countCalls.keptForFinishing))]);
    remaining.callsLeft = callsLeft;
  }
  if (budget.maxDurationMs !== undefined) {
    const msLeft = budget.maxDurationMs - spent.elapsedMs;
    const averageMs = spent.decisions ? spent.elapsedMs / spent.decisions : 0;
    counts.push(["duration", msLeft <= 0 ? 0 : averageMs > 0 ? Math.floor(msLeft / averageMs) : iterationsLeft]);
    remaining.secondsLeft = Math.max(0, Math.floor(msLeft / 1_000));
  }
  // The first of the smallest, so the backstop is named only when it is the
  // bound that binds and no budget ties it.
  const [limitedBy, fewest] = counts.reduce((least, entry) => entry[1] < least[1] ? entry : least);
  return { decisionsLeft: Math.max(0, fewest), limitedBy, ...remaining };
}

/** The entry the model reads its remaining budget from: closed numbers and Core's words. */
export function automationStudioLlmEvidenceBudgetEntry(
  iteration: number,
  remaining: AutomationStudioLlmEvidenceLoopRemaining,
  /** Whether the loop is withholding new tools this decision; absent, read from what is left. */
  wrappingUp?: boolean,
  /** Whether the loop authors a candidate (`discoveryOnly`), which finishes by submitting, testing and completing. */
  candidate = false,
  /** The candidate loop's finishing tools, named in its words; the candidate's own when absent. */
  finishing: AutomationStudioLlmEvidenceFinishingTools = AUTOMATION_STUDIO_LLM_EVIDENCE_CANDIDATE_FINISHING_TOOLS
): { callId: string; toolId: string; value: JsonObject } {
  const { limitedBy: _limitedBy, ...shown } = remaining;
  const wrapping = wrappingUp ?? remaining.decisionsLeft <= wrapUpDecisions(candidate);
  const instruction = candidate
    ? remaining.decisionsLeft <= 1 ? candidateFinalInstruction(finishing) : wrapping ? candidateWrapUpInstruction(finishing) : CANDIDATE_BUDGET_INSTRUCTION
    : remaining.decisionsLeft <= 1 ? FINAL_INSTRUCTION : wrapping ? WRAP_UP_INSTRUCTION : BUDGET_INSTRUCTION;
  return {
    callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID}.${iteration}`,
    toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID,
    value: {
      code: "llm_evidence_loop.budget",
      ...shown,
      instruction
    }
  };
}

/** Whether every bound given is a finite number a loop can count down from. */
export function automationStudioLlmEvidenceLoopBudgetValid(budget: AutomationStudioLlmEvidenceLoopBudget): boolean {
  const bounds = [budget.maxTotalTokens, budget.maxTokensPerDecision, budget.maxCostUsd, budget.maxDurationMs];
  return bounds.every((bound) => bound === undefined || (typeof bound === "number" && Number.isFinite(bound) && bound > 0))
    && (budget.now === undefined || typeof budget.now === "function")
    && (budget.countCalls === undefined || (Number.isSafeInteger(budget.countCalls.keptForFinishing) && budget.countCalls.keptForFinishing >= 0));
}
