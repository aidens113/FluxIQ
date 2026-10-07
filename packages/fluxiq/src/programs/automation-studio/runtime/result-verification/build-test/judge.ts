// The judge of a build's test: the results verifier a finished run gets, asked
// about the test the build ran before proposing its Flow (t195-w25, section 2).
//
// It is the same call, not a second judge: `verifyAutomationStudioRunResult`
// with a summary that carries `buildTest` (`./summary.ts`), under the same
// deadline (`../deadline.ts`), asked again on anything but yes and reconciled
// the same way (`../agreement.ts`). Two things differ. Its first yes is asked
// again too (`confirmAnswer`), because a yes finishes the build: in live run
// murwcmx2 build judges 0032 and 0051 got the same request but for one step
// number, answered no and then yes, and the one yes finished the build on rows
// the playback judge refused. And its outcome is read as a build's verdict:
//
//   answers, then answers                             -> yes
//   answers, then unknown or a silent reply           -> unknown, unconfirmed (t296:
//                                                         a yes needs a confirming yes)
//   answers, then does_not_answer                     -> unknown, with the second
//                                                         call's reading, unconfirmed
//   answers, then a call not back usable              -> unknown, unconfirmed (not_judged
//                                                         where the purse refused it)
//   does_not_answer that fails a run                  -> no, with the judgement and Core's finding codes
//   unsure, or a second ask that did not settle it     -> unknown, with the
//                                                         reading of a call that
//                                                         judged no, unconfirmed
//   not performed (no model), or the deadline passed  -> not_judged
//   a call the build's purse would not pay for        -> not_judged, saying the spending limit stopped it
//
// A yes the verdict did not take -- one that did not name each row a condition
// alone left out that names the asked item (`../verdict.ts`, live run
// `run-muw60j7c-bb7c9a62`) -- arrives as `does_not_answer` and is read like any
// other: two of them are a no, carrying Core's finding code and, in `checked`,
// Core's lines naming the rows; beside a yes that named them, unknown. The no
// also carries, in `fix`, Core's fix lines for those rows -- the condition, the
// item and each row -- because the build's repair round is told the rows only
// through them and `checked` (`../../flow-bootstrap/unfinished-build/judgement.ts`;
// until t274-c25b it kept the finding code alone). Beside `checked` it carries
// the rows those lines name as left out, per read and condition
// (`checkedRows`, `../request-rows/checked-rows-named.ts`), so a repair can say
// which of them a rerun of that read now keeps (live run
// `run-mux6naez-6c20f26e`, R3-3). Core's other fix lines are a
// finished run's: "add or fix the step that stores" answers a record set a test
// never keeps, so they are not passed on, as their findings are not.
//
// A no's `records.stored` is what the Flow would store, as the test's reads
// filled it (`summary.buildTest.stores`, `./stores.ts`), where the summary says:
// a test stores nothing itself, so the run's own count was always 0 -- live run
// `run-muw60j7c-bb7c9a62`'s Flow would have stored 30 rows (20 + 10, t274-c25b).
//
// and that the build pays: the calls' spend is returned, and a build with no
// cost left is not asked at all. A build that runs under its purse
// (`../../llm/build-purse/run.ts`, t234) has each judge call held there at its
// true worst case, so the judge sets no cap of its own; one made outside any
// purse is still capped at half of what is left per call, as verify asks twice
// after any first answer. A refused call never surfaces as a throw or as an
// unsure verdict: the test was not judged, and the reason says the money ran
// out. That holds for a refused confirmation of a first yes too: a yes checked
// once is not confirmed (`../agreement.ts`, live run `run-mux6nxst-c9bca37c`,
// where it finished a build), and the first call's spend is still returned. A
// confirmation that failed any other way leaves the yes unconfirmed: unknown. A cancelled
// build is not a verdict: the cancellation is thrown, for the phases to end the
// build as cancelled.

import { randomUUID } from "node:crypto";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowIntervention } from "../../../model/index.ts";
import { automationStudioLlmCurrentBuildPurse, type AutomationStudioLlmBuildPurseRefusal } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultRepairDirective, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationWithinDeadline } from "../deadline.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import { automationStudioResultCheckedRowsNamed, type AutomationStudioRequestRowsNamed } from "../request-rows/index.ts";
import {
  verifyAutomationStudioRunResult,
  type AutomationStudioResultVerificationReport,
  type AutomationStudioResultVerificationRequest
} from "../verify.ts";
import { automationStudioBuildTestUntestedCarried } from "./summary.ts";

/** What the judge's calls cost. */
export type AutomationStudioBuildTestJudgeSpend = {
  inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number;
  /** Provider calls made: verify asks once, and again after any first answer the model gave, yes included (one intervention each). A build counts them with its other calls outside the loop. */
  calls: number;
};

/**
 * What a judged test stored, from the summary it was judged on: rows stored,
 * rows refused, and stored rows missing a required value, across every record
 * set (`AutomationStudioRunResultSummary`). A build measures a repair's progress
 * by them (t240): fewer refused or incomplete rows, or rows where none were.
 */
export type AutomationStudioBuildTestRecordCounts = { stored: number; refused: number; missingRequired: number };

/**
 * The judge's verdict on a build's test.
 *
 * Structurally `AutomationStudioFlowBootstrapTestVerdict`
 * (`flow-bootstrap/unfinished-build/contracts.ts`, t195-w25 section 4.1),
 * declared here so the two could be written at once.
 * TODO(t195 lead): unify with that type at integration.
 */
export type AutomationStudioBuildTestVerdict =
  | { verdict: "yes"; spent: AutomationStudioBuildTestJudgeSpend }
  | {
    verdict: "unknown" | "not_judged"; why: string; untestedCarried?: number[];
    /**
     * Only on an `unknown` two checks did not settle, where one call judged the
     * test not to do what was asked: that call's expected, observed and advice
     * (`AutomationStudioResultVerification.unconfirmedReading`). One judge's
     * reading the other call did not confirm -- never a `no`.
     */
    unconfirmedReading?: { expected?: string; observed?: string; advice?: string };
    /**
     * Only on an `unknown` whose two calls disagreed because one said the test
     * does what was asked (`model_disagreed`): the pair, never its words. What a
     * build measures a repair after a `no` by (`judge_no_longer_refutes`,
     * `flow-bootstrap/unfinished-build/progress.ts`; live run run-musp4h2f-72e8ed99).
     */
    oneCallSaidYes?: true;
    spent: AutomationStudioBuildTestJudgeSpend;
  }
  | {
    verdict: "no"; expected?: string; observed?: string; advice?: string; stillAchievable?: "yes" | "no" | "unknown"; findings: string[];
    /**
     * Core's fix lines for the rows a yes passed over, one per condition, naming
     * the condition, the item and each row (`../repair-directive.ts`). Absent
     * when there are none.
     */
    fix?: string[];
    /**
     * Core's lines on the rows the judgement names, or that a yes passed over
     * (`AutomationStudioResultRepairDirective.checked`, `../request-rows/`):
     * Core's words, never the judge's. Absent when there are none.
     */
    checked?: string[];
    /**
     * The rows `checked` names as left out by one condition of one read, in
     * structured form (`../request-rows/checked-rows-named.ts`): per read, the
     * condition and the labels Core matched. What a repair compares a rerun of
     * that read with (live run `run-mux6naez-6c20f26e`, R3-3). Absent when the
     * lines name none.
     */
    checkedRows?: AutomationStudioRequestRowsNamed[];
    records: AutomationStudioBuildTestRecordCounts; spent: AutomationStudioBuildTestJudgeSpend;
  };

/** One question to the judge: the test's summary, and what the build has left to spend. */
export type AutomationStudioBuildTestJudgeInput = {
  summary: AutomationStudioRunResultSummary;
  budget?: { maxCostUsd?: number | undefined } | undefined;
};

/**
 * Core's finding that a run kept no record set. Every build test keeps none,
 * so the finding says nothing about it and is not passed on.
 */
const NOT_A_FINDING_OF_A_TEST: ReadonlySet<string> = new Set([AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.noRecordSet]);

const NOTHING_SPENT: AutomationStudioBuildTestJudgeSpend = Object.freeze({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 });

/** A judge bound to one build: its provider, its instruction and its declared keys. */
export function automationStudioBuildTestJudge(deps: {
  verify?: ((request: AutomationStudioResultVerificationRequest) => Promise<AutomationStudioResultVerificationReport>) | undefined;
  provider?: AutomationStudioLlmProvider | undefined;
  instructions: readonly AutomationStudioFlowInstruction[];
  deniedEvidenceKeys?: readonly string[] | undefined;
  projectId: string;
  flowId: string;
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
  /** The whole judgement's deadline; `deadline.ts`'s default when absent. */
  deadlineMs?: number | undefined;
}): (input: AutomationStudioBuildTestJudgeInput) => Promise<AutomationStudioBuildTestVerdict> {
  const verify = deps.verify ?? verifyAutomationStudioRunResult;
  return async (input) => {
    const untestedCarried = automationStudioBuildTestUntestedCarried(input.summary.buildTest);
    const carried = untestedCarried.length ? { untestedCarried } : {};
    const maxCostUsd = input.budget?.maxCostUsd;
    if (maxCostUsd !== undefined && !(maxCostUsd > 0)) {
      return { verdict: "not_judged", why: "The build had no cost left to ask the judge, so its test was not judged.", ...carried, spent: { ...NOTHING_SPENT } };
    }
    // The purse the harness holds each call against (`../../llm/build-purse/harness-hold.ts`); a refusal set after this one is the judge's.
    const purse = automationStudioLlmCurrentBuildPurse();
    const refusedBefore = purse?.refusal;
    const callsBefore = purse?.spentCalls();
    const bounded = await automationStudioResultVerificationWithinDeadline({
      ...(deps.deadlineMs !== undefined ? { deadlineMs: deps.deadlineMs } : {}),
      signal: deps.signal,
      judge: () => verify({
        projectId: deps.projectId,
        flowId: deps.flowId,
        runId: `build-test.${randomUUID()}`,
        summary: input.summary,
        instructions: deps.instructions,
        ...(deps.deniedEvidenceKeys ? { deniedEvidenceKeys: deps.deniedEvidenceKeys } : {}),
        ...(deps.provider ? { provider: deps.provider } : {}),
        // A yes finishes the build, so it is confirmed by a second call like any other answer (`../agreement.ts`).
        confirmAnswer: true,
        // Under a purse each call is held at its true worst case there. Outside one, verify asks twice after any answer (`../verify.ts`), each call under this cap: half each, so the judgement never spends more than the build has left.
        ...(maxCostUsd !== undefined && !purse ? { maxEstimatedCostUsd: maxCostUsd / 2 } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
        ...(deps.now ? { now: deps.now } : {})
      })
    });
    if (deps.signal?.aborted) throw deps.signal.reason ?? new DOMException("The build was cancelled.", "AbortError");
    // A call the purse refused reaches verify as a harness failure, which it reads as an unsure verdict; the judge says what it was.
    const refused = purse?.refusal !== undefined && purse.refusal !== refusedBefore ? purse.refusal : undefined;
    // A refused confirmation of a first yes confirms nothing (`../agreement.ts`, run-mux6nxst-c9bca37c): the outcome is unsure, so it is not judged here, with what the first call spent.
    const judgeSpend = bounded.settled ? spentBy(bounded.value.interventions) : { ...NOTHING_SPENT };
    if (refused?.code === "llm_budget.run_call_limit" && purse && callsBefore !== undefined) judgeSpend.calls = Math.max(0, purse.spentCalls() - callsBefore);
    const yesStood = bounded.settled && bounded.value.outcome.performed && bounded.value.outcome.verdict === "answers";
    if (refused && !yesStood) return { verdict: "not_judged", why: refusedSaid(refused), ...carried, spent: judgeSpend };
    if (!bounded.settled) {
      // An abandoned call's spend is not known: it is still running, and its
      // interventions arrive only with its answer.
      const why = bounded.reason === "timed_out"
        ? "The judge did not answer inside its deadline, so the test was not judged."
        : "The judge failed before it answered, so the test was not judged.";
      return { verdict: "not_judged", why, ...carried, spent: { ...NOTHING_SPENT } };
    }
    const spent = judgeSpend;
    const outcome = bounded.value.outcome;
    if (!outcome.performed) return { verdict: "not_judged", why: outcome.reason, ...carried, spent };
    if (outcome.verdict === "answers") return { verdict: "yes", spent };
    if (outcome.verdict === "does_not_answer" && automationStudioResultVerificationFailsRun(outcome)) {
      const judgement = outcome.repair?.judgement;
      // The same rows in structured form, read from Core's lines against the summary they were made from (R3-3).
      const checkedRows = automationStudioResultCheckedRowsNamed(input.summary, outcome.repair?.checked ?? []);
      return {
        verdict: "no",
        ...(judgement?.expected ? { expected: judgement.expected } : {}),
        ...(judgement?.observed ? { observed: judgement.observed } : {}),
        ...(judgement?.advice ? { advice: judgement.advice } : {}),
        // The build ends "not doable" only when the judge says this (t195-w37).
        ...(judgement?.stillAchievable ? { stillAchievable: judgement.stillAchievable } : {}),
        findings: (outcome.repair?.findings ?? []).map((finding) => finding.code).filter((code) => !NOT_A_FINDING_OF_A_TEST.has(code)),
        // Which rows the judgement named are in the test's result or were left out, and which rows a yes passed over (live run `run-muw60j7c-bb7c9a62`).
        ...(outcome.repair?.checked?.length ? { checked: [...outcome.repair.checked] } : {}),
        ...(checkedRows.length ? { checkedRows } : {}),
        ...rowFix(outcome.repair),
        // The counts the verdict was reached from, for the build to measure the next repair against (t240).
        records: { stored: wouldStore(input.summary), refused: input.summary.totalRefusedCount, missingRequired: input.summary.totalRowsMissingRequired },
        spent
      };
    }
    // An unsettled check keeps the reading of the call that judged no (live run murwcmx2: the repair was told only "unverified").
    const reading = outcome.unconfirmedReading;
    return { verdict: "unknown", why: outcome.reason, ...carried, ...(reading ? { unconfirmedReading: { ...reading } } : {}), ...(outcome.basis === "model_disagreed" ? { oneCallSaidYes: true as const } : {}), spent };
  };
}

/**
 * Core's fix lines for the rows a yes passed over: the directive puts one per
 * `result.left_out_naming_the_item` finding first, in the findings' order
 * (`automationStudioResultRepairDirective`). Nothing when there are none.
 */
function rowFix(repair: AutomationStudioResultRepairDirective | undefined): { fix?: string[] } {
  const rows = (repair?.findings ?? []).filter((finding) => finding.code === AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem).length;
  return rows && repair ? { fix: repair.fix.slice(0, rows) } : {};
}

/** The rows the Flow would store, as the test's reads filled it; the summary's own count where it does not say. */
function wouldStore(summary: AutomationStudioRunResultSummary): number {
  const stores = summary.buildTest?.stores;
  return stores ? stores.reduce((total, store) => total + store.answer.rows, 0) : summary.totalRecordCount;
}

/** Why a judge the purse refused did not judge, in the purse's figures. */
function refusedSaid(refusal: AutomationStudioLlmBuildPurseRefusal): string {
  if (refusal.code === "llm_budget.run_call_limit") return `The build's model call allowance of ${refusal.maxCalls} had ${Math.max(0, refusal.maxCalls - refusal.spentCalls - refusal.pendingCalls)} calls left, too few for the judge's call, so its test was not judged.`;
  const call = refusal.projectedCostUsd !== undefined ? `the judge's call, which could have cost up to $${refusal.projectedCostUsd.toFixed(3)}` : "the judge's call";
  const left = Math.max(0, refusal.ceilingUsd - refusal.spentUsd - refusal.pendingUsd);
  return `The build's spending limit of $${refusal.ceilingUsd.toFixed(2)} had $${left.toFixed(3)} left, too little for ${call}, so its test was not judged.`;
}

/** What every call cost, summed; a call that reported nothing counts nothing. */
function spentBy(interventions: readonly AutomationStudioFlowIntervention[]): AutomationStudioBuildTestJudgeSpend {
  const spent = { ...NOTHING_SPENT, calls: interventions.length };
  for (const intervention of interventions) {
    const usage = intervention.tokenUsage;
    spent.inputTokens += finite(usage?.inputTokens);
    spent.outputTokens += finite(usage?.outputTokens);
    spent.totalTokens += finite(usage?.totalTokens);
    spent.estimatedCostUsd += finite(usage?.estimatedCostUsd);
  }
  return spent;
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
