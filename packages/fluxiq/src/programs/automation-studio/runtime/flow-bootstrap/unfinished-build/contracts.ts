// What a build that stopped before its Flow was ready is made of, as it moves
// through the user's lifecycle: how a live round ended, what the test and the
// judgement found, and how the build ended when it could not finish.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type {
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopExhaustion,
  AutomationStudioLlmEvidenceLoopProviderUnavailable,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceLoopUnreadable
} from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound } from "../generation-failure/index.ts";

/** Why a live round stopped without the model saying the Flow was ready, where no budget was the reason. */
export type AutomationStudioFlowBootstrapUnfinishedStop =
  /** It used the decisions or tool calls a round is allowed. */
  | "iterations"
  | "tool_calls"
  /** Its decisions kept coming back unusable: most often completions the check kept refusing. */
  | "unusable_decisions"
  /** Its no-progress guard stopped it. */
  | "repeat_without_progress"
  /**
   * It finished: the model said the Flow was ready and its test passed, but
   * the judge of the test's results said the Flow does not do what was asked,
   * or could not judge it because steps carried from an earlier Flow were not
   * run in this test (`./phases.ts`).
   */
  | "judged_wrong";

/** What one judge of a Flow's test spent, counted against the build's budget. */
export type AutomationStudioFlowBootstrapJudgeSpend = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };

/**
 * The judge's verdict on a finished round: whether what the Flow's test from
 * its start actually did is what the instruction asks. `not_judged` is a judge
 * that could not run -- no cost left, the deadline passed, or it was stopped.
 * `untestedCarried` is the positions of steps carried from an earlier Flow
 * that this test did not run, whose acts it therefore has no evidence of.
 */
export type AutomationStudioFlowBootstrapTestVerdict =
  | { verdict: "yes"; spent: AutomationStudioFlowBootstrapJudgeSpend }
  | { verdict: "unknown" | "not_judged"; why: string; untestedCarried?: number[]; spent: AutomationStudioFlowBootstrapJudgeSpend }
  | { verdict: "no"; expected?: string; observed?: string; advice?: string; findings: string[]; records?: AutomationStudioFlowBootstrapJudgedRecords; spent: AutomationStudioFlowBootstrapJudgeSpend };

/**
 * What the judged test stored, from the summary the judge read (t240): rows
 * stored, rows refused, and stored rows missing a required value. What a
 * repair's progress is measured by (`./progress.ts`). Absent where the judge
 * reported none.
 */
export type AutomationStudioFlowBootstrapJudgedRecords = { stored: number; refused: number; missingRequired: number };

/**
 * The judge's account of a Flow it sent back to repair, as the repair is told
 * it. `no` with what it did not do; `unknown` or `not_judged` only where steps
 * carried from an earlier Flow were not run, with `findings` holding why.
 */
export type AutomationStudioFlowBootstrapJudgedWrong = {
  verdict: "no" | "unknown" | "not_judged";
  expected?: string;
  observed?: string;
  advice?: string;
  findings: string[];
  untestedCarried?: number[];
  /** A `no`'s record counts, where the judge reported them. */
  records?: AutomationStudioFlowBootstrapJudgedRecords;
};

/** What a stopped round had recorded: its rows and what it spent. */
export type AutomationStudioFlowBootstrapRoundProgress = {
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
  /** Which allowance ran out, where the round ran out of one. */
  exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion;
};

/** How one live round ended, read for what the build does next. */
export type AutomationStudioFlowBootstrapRoundEnding =
  /** The model said the Flow was ready, and the check and the test accepted it. */
  | { kind: "finished"; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }> }
  /** An ending this lifecycle does not reach past: cancelled, a refused configuration, the evidence backstop. */
  | { kind: "other"; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }> }
  /** It stopped short, with a draft to test, judge and repair. */
  | {
    kind: "unfinished";
    stopped: AutomationStudioFlowBootstrapUnfinishedStop;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /**
   * The provider's replies kept arriving unreadable, each asked again with a
   * note of what could not be read, until an unbroken run of them reached its
   * limit (`../../llm/unreadable-reply.ts`): ended as exactly that, with how
   * many tries it took. `stopped` is the stop a later build is told.
   */
  | {
    kind: "unreadable";
    stopped: "unusable_decisions";
    unreadable: AutomationStudioLlmEvidenceLoopUnreadable;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /**
   * The model provider stopped answering: an unbroken run of decision calls got
   * no answer (`../../llm/unanswered-calls.ts`). Ended at once, untested,
   * as exactly that. `stopped` is the stop a later build is told: no usable
   * decision came back.
   */
  | {
    kind: "provider_unavailable";
    stopped: "unusable_decisions";
    providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /** A budget ran out: reported as exactly that. */
  | {
    kind: "budget";
    bound: AutomationStudioFlowBootstrapBudgetBound;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  };

/**
 * What one round measurably did better than the judged round before it, read
 * only from what the build's test and the judge report (`./progress.ts`):
 * - `acts_done`: more of the checklist's acts and choices have a step;
 * - `acts_proven`: more of those steps worked when the Flow ran from its start;
 * - `test_passes`: the Flow now runs clean from its start where it did not;
 * - `fewer_failed_steps`: it still fails, but at fewer steps;
 * - `more_working_steps`: with no judge on either side, more steps worked when it ran;
 * - `finished_and_judged`: the model said it was ready and its test passed, where the round before stopped short;
 * - `carried_steps_judged`: the judge could not judge the Flow before (steps carried and never run) and now judged it;
 * - `judge_findings_resolved`: a finding the judge reported before is no longer reported;
 * - `records_stored`: the test stored rows where it stored none;
 * - `fewer_records_refused`: fewer rows were refused, with no fewer stored;
 * - `fewer_records_missing_required`: fewer stored rows lack a required value, with no fewer stored.
 */
export type AutomationStudioFlowBootstrapProgressMeasure =
  | "acts_done"
  | "acts_proven"
  | "test_passes"
  | "fewer_failed_steps"
  | "more_working_steps"
  | "finished_and_judged"
  | "carried_steps_judged"
  | "judge_findings_resolved"
  | "records_stored"
  | "fewer_records_refused"
  | "fewer_records_missing_required";

/**
 * Why no route is left, as the not-doable ending says it (t240):
 * `no_progress` -- the round measurably did no better than the judged round
 * before it (`before`); `repeated_unchanged` -- the round ended on refused
 * repeats of the same calls and handed back the Flow it started from, so a
 * second round would only repeat it (run 38, cause C8).
 */
export type AutomationStudioFlowBootstrapNoRouteLeft =
  | { kind: "no_progress"; before: AutomationStudioFlowBootstrapJudgement }
  | { kind: "repeated_unchanged" };

/** What the test of the Flow so far found. */
export type AutomationStudioFlowBootstrapTested = "replayed_clean" | "replay_failed" | "not_tested";

/**
 * The judgement of a Flow (phase 2), for a round that stopped short or one
 * that finished and was judged wrong: what the test did, how much of the
 * checklist the Flow does, and, after a judge, what it found. Codes, counts,
 * ids and the judge's screened words: what the repair is told, and what an
 * ending is written from.
 */
export type AutomationStudioFlowBootstrapJudgement = {
  /** The round that stopped: 0 for the exploration, then each repair. */
  round: number;
  stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget";
  tested: AutomationStudioFlowBootstrapTested;
  /** The test's refusal codes, when it refused. */
  testIssueCodes: string[];
  /** The positions, in the Flow, of the steps that did not work when it was run from its start. */
  failedSteps: number[];
  /** Steps in the Flow. */
  stepsInFlow: number;
  /** Acts and choices done, and the ids of those still to do. */
  done: number;
  /**
   * Of `done`, those whose step worked when the Flow was run from its start in
   * this judgement's test: a result, where `done` is a claim (a step named for
   * it). Absent when nothing was tested.
   */
  proven?: number;
  todo: string[];
  /** The last refusal codes the model was shown before the round stopped. */
  lastIssueCodes: string[];
  /** A finished round the judge sent back: what it found. Absent for a round that stopped short. */
  judge?: AutomationStudioFlowBootstrapJudgedWrong;
  /**
   * The Flow's replay signature (`automationStudioFlowDraftReplaySignature`):
   * a repair after a judged Flow advanced only if this changed, or more of the
   * checklist was done.
   */
  flowSignature?: string;
};
