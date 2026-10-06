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
   * the Flow was not judged to do what was asked (`./phases.ts`): the judge
   * said it does not, was unsure, or did not judge it, or its yes was about a
   * test of another version of the Flow or about no test at all. Only a yes
   * about a test of the Flow as it now stands finishes a build (user,
   * 2026-10-02).
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
 *
 * `flowSignature` is the Flow signature
 * (`automationStudioFlowDraftFlowSignature`) of the test the verdict judged,
 * stamped by the build's judge from the round's observed test; absent when no
 * test was judged. A yes finishes a build only when it equals the signature of
 * the Flow the round finished with (user, 2026-10-02; `./phases.ts`).
 *
 * `unconfirmedReading` is set only on an `unknown` two checks of the test did
 * not settle, where one call judged it not to do what was asked: that call's
 * expected, observed and advice. One judge's reading the other call did not
 * confirm, kept apart from a `no`'s own fields so nothing reads it as one.
 *
 * `oneCallSaidYes` is set only on an `unknown` whose two checks disagreed
 * because one of them said the test does what was asked (`model_disagreed`,
 * `../../result-verification/agreement.ts`): which pair it was, never what
 * either call said. A `no` then nothing said (`model_unconfirmed`) never sets
 * it. What `./progress.ts` measures a judge that stopped refuting by.
 *
 * A `yes` may carry the judge's `confidence` and, under `unconfirmedAdvice`,
 * the advice and `patchNeeded` it gave beside its yes. Both are kept for the
 * record only (`./finishing-verdict.ts`): the build decides from `verdict` and
 * `flowSignature` alone, and a yes's advice is never a repair directive -- it
 * is never put on a judgement, a resume or a re-author's seed (live run
 * `run-murwd8le-79e735a8`, cause 10: a yes with `patchNeeded: true` advised
 * "Remove or reorder step 11", and removing it would have broken the Flow).
 */
export type AutomationStudioFlowBootstrapTestVerdict =
  | { verdict: "yes"; spent: AutomationStudioFlowBootstrapJudgeSpend; flowSignature?: string; confidence?: number; unconfirmedAdvice?: AutomationStudioFlowBootstrapYesAdvice }
  | { verdict: "unknown" | "not_judged"; why: string; untestedCarried?: number[]; unconfirmedReading?: AutomationStudioFlowBootstrapJudgeReading; oneCallSaidYes?: true; spent: AutomationStudioFlowBootstrapJudgeSpend; flowSignature?: string }
  | { verdict: "no"; expected?: string; observed?: string; advice?: string; findings: string[]; fix?: string[]; checked?: string[]; records?: AutomationStudioFlowBootstrapJudgedRecords; stillAchievable?: AutomationStudioFlowBootstrapStillAchievable; spent: AutomationStudioFlowBootstrapJudgeSpend; flowSignature?: string };

/**
 * Whether the judge said what was asked can still be had (its diagnosis's
 * `stillAchievable`). Only a `no` ends a build "not doable" (t195-w37: the
 * user's rule, "only if there is absolutely no way"); absent is `unknown`.
 */
export type AutomationStudioFlowBootstrapStillAchievable = "yes" | "no" | "unknown";

/**
 * What the judged test stored, from the summary the judge read (t240): rows
 * stored, rows refused, and stored rows missing a required value. What a
 * repair's progress is measured by (`./progress.ts`). Absent where the judge
 * reported none.
 */
export type AutomationStudioFlowBootstrapJudgedRecords = { stored: number; refused: number; missingRequired: number };

/**
 * What a judge that said `yes` also advised: its advice and whether it said a
 * patch was needed. Unconfirmed by construction -- the verdict it came with did
 * not act on it, and nothing checked its premise -- so it is information on the
 * record, never a directive (cause 10, `run-murwd8le-79e735a8`).
 */
export type AutomationStudioFlowBootstrapYesAdvice = { advice?: string; patchNeeded?: boolean };

/** What one judge call said of a test: what was asked, what the test did, and what to change. Every part optional. */
export type AutomationStudioFlowBootstrapJudgeReading = { expected?: string; observed?: string; advice?: string };

/**
 * The judge's account of a Flow it sent back to repair, as the repair is told
 * it. `no` with what it did not do; `unknown` or `not_judged` for a Flow not
 * judged to do it -- the judge unsure, not run, or its yes about a test of
 * another version of the Flow or of none -- with `findings` holding why, and
 * `untestedCarried` naming steps carried from an earlier Flow that its test
 * did not run.
 */
export type AutomationStudioFlowBootstrapJudgedWrong = {
  verdict: "no" | "unknown" | "not_judged";
  /** A `no`'s: what was asked, what the test did, what to change. */
  expected?: string;
  observed?: string;
  advice?: string;
  findings: string[];
  /**
   * A `no`'s only, where Core gave them: Core's fix lines naming the rows a yes
   * passed over (`fix`), and Core's check of the rows the judgement names
   * against what the test read (`checked`, `result-verification/request-rows/`).
   * Core's words, never the judge's: what the repair weighs the advice by
   * (live run `run-muw60j7c-bb7c9a62`, t274-c25b).
   */
  fix?: string[];
  checked?: string[];
  untestedCarried?: number[];
  /**
   * An `unknown`'s only: the reading of the one judge call that said the test
   * does not do what was asked, which the other call did not confirm (live run
   * murwcmx2). Information for the repair to weigh against the rows, never a
   * verdict.
   */
  unconfirmedReading?: AutomationStudioFlowBootstrapJudgeReading;
  /**
   * An `unknown`'s only: one of its two judge calls said the test does what
   * was asked (`model_disagreed`). The pair, not the judge's words: what a
   * repair after a `no` is measured by (`judge_no_longer_refutes`, `./progress.ts`).
   */
  oneCallSaidYes?: true;
  /** A `no`'s record counts, where the judge reported them. */
  records?: AutomationStudioFlowBootstrapJudgedRecords;
  /** A `no`'s word on whether what was asked can still be had, where the judge gave it. */
  stillAchievable?: AutomationStudioFlowBootstrapStillAchievable;
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
 * - `judged_after_unjudged`: the Flow before was not judged to do what was asked or not to (the judge unsure, not run, its yes about another version or no test, steps carried and never run), and this one was judged: a `no` (a `yes` about this Flow finishes the build and never reaches a measure);
 * - `judge_no_longer_refutes`: the Flow before was judged not to do what was asked by two agreeing judge calls (`no`), and this one was not: of its two calls one said it does (`unknown` with `oneCallSaidYes`, `model_disagreed`). A `no` and a call that said nothing (`model_unconfirmed`) is not this measure;
 * - `judge_findings_resolved`: a finding the judge reported before is no longer reported;
 * - `records_stored`: the test stored rows where it stored none;
 * - `fewer_records_refused`: fewer rows were refused, with no fewer stored;
 * - `fewer_records_missing_required`: fewer stored rows lack a required value, with no fewer stored;
 * - `fewer_steps_not_run`: fewer of the Flow's steps are carried from an earlier Flow and never run in this build (`notRunInThisBuild`);
 * - `flow_changed_unmeasured`: the round could not be measured -- steps carried into its Flow never ran in this build, so the Flow could not be run from its start -- and its Flow differs from the one before. Never progress between two rounds that were measured: a Flow merely different is not further.
 */
export type AutomationStudioFlowBootstrapProgressMeasure =
  | "acts_done"
  | "acts_proven"
  | "test_passes"
  | "fewer_failed_steps"
  | "more_working_steps"
  | "finished_and_judged"
  | "judged_after_unjudged"
  | "judge_no_longer_refutes"
  | "judge_findings_resolved"
  | "records_stored"
  | "fewer_records_refused"
  | "fewer_records_missing_required"
  | "fewer_steps_not_run"
  | "flow_changed_unmeasured";

/**
 * Why no route is left, as the not-doable ending says it: the judge said what
 * was asked can no longer be had (`stillAchievable: "no"`), about a round that
 * was run from its start. The only case since t195-w37 -- a round that got no
 * further is not one (live run `run-murwcaj0-40e56557`, whose judge said "still
 * achievable" and named the fix, and whose build ended "I found no way to"),
 * and nothing is concluded from a round whose Flow holds steps carried from an
 * earlier Flow that never ran in this build, which has no measurement
 * (t194-w70, `./phases.ts`).
 */
export type AutomationStudioFlowBootstrapNoRouteLeft = { kind: "judged_unachievable" };

/**
 * Why a build with a route still open stopped, as the not-finished ending
 * says it (t240; t195-w37): `no_progress` -- the last round, and `rounds` in a
 * row, measurably did no better than the judged round before (`before`, the
 * judgement before the last); `repeated_unchanged` -- the round ended on
 * refused repeats of the same calls and handed back the Flow it started from,
 * so a second round would only repeat it (run 38, cause C8).
 */
export type AutomationStudioFlowBootstrapStoodStill =
  | { kind: "no_progress"; before: AutomationStudioFlowBootstrapJudgement; rounds: number }
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
  /**
   * The positions, in the Flow, of steps carried from an earlier Flow by a
   * re-author or an extend that have not run in this build
   * (`not_run_in_this_build`, `../../flow-draft/full-run-required.ts`): no
   * argument they ran with, nothing to put the target back with. Core does not
   * run them itself -- the permission gate reads their absent consequence
   * declaration as "none" -- so a Flow holding one is not tested at a round's
   * end, and the round has no measurement (t194-w70). Absent when there is none.
   */
  notRunInThisBuild?: number[];
  /** A finished round the judge sent back: what it found. Absent for a round that stopped short. */
  judge?: AutomationStudioFlowBootstrapJudgedWrong;
  /**
   * The Flow's replay signature (`automationStudioFlowDraftReplaySignature`):
   * a repair after a judged Flow advanced only if this changed, or more of the
   * checklist was done.
   */
  flowSignature?: string;
};
