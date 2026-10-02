// The judge of a build's test: the results verifier a finished run gets, asked
// about the test the build ran before proposing its Flow (t195-w25, section 2).
//
// It is the same call, not a second judge: `verifyAutomationStudioRunResult`
// with a summary that carries `buildTest` (`./summary.ts`), under the same
// deadline (`../deadline.ts`), asked again on anything but yes and reconciled
// the same way (`../agreement.ts`). What is new is only how its outcome is read
// by a build:
//
//   answers                                           -> yes
//   does_not_answer that fails a run                  -> no, with the judgement and Core's finding codes
//   unsure, or a second ask that did not settle it     -> unknown
//   not performed (no model), or the deadline passed  -> not_judged
//   a call the build's purse would not pay for        -> not_judged, saying the spending limit stopped it
//
// and that the build pays: the calls' spend is returned, and a build with no
// cost left is not asked at all. A build that runs under its purse
// (`../../llm/build-purse/run.ts`, t234) has each judge call held there at its
// true worst case, so the judge sets no cap of its own; one made outside any
// purse is still capped at half of what is left per call, as verify may ask
// twice. A refused call never surfaces as a throw or as an unsure verdict: the
// test was not judged, and the reason says the money ran out. A cancelled
// build is not a verdict: the cancellation is thrown, for the phases to end the
// build as cancelled.

import { randomUUID } from "node:crypto";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowIntervention } from "../../../model/index.ts";
import { automationStudioLlmCurrentBuildPurse, type AutomationStudioLlmBuildPurseRefusal } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationWithinDeadline } from "../deadline.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import {
  verifyAutomationStudioRunResult,
  type AutomationStudioResultVerificationReport,
  type AutomationStudioResultVerificationRequest
} from "../verify.ts";
import { automationStudioBuildTestUntestedCarried } from "./summary.ts";

/** What the judge's calls cost. */
export type AutomationStudioBuildTestJudgeSpend = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };

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
  | { verdict: "unknown" | "not_judged"; why: string; untestedCarried?: number[]; spent: AutomationStudioBuildTestJudgeSpend }
  | { verdict: "no"; expected?: string; observed?: string; advice?: string; findings: string[]; spent: AutomationStudioBuildTestJudgeSpend };

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

const NOTHING_SPENT: AutomationStudioBuildTestJudgeSpend = Object.freeze({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

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
        // Under a purse each call is held at its true worst case there. Outside one, verify may ask twice (`../verify.ts`), each call under this cap: half each, so the judgement never spends more than the build has left.
        ...(maxCostUsd !== undefined && !purse ? { maxEstimatedCostUsd: maxCostUsd / 2 } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
        ...(deps.now ? { now: deps.now } : {})
      })
    });
    if (deps.signal?.aborted) throw deps.signal.reason ?? new DOMException("The build was cancelled.", "AbortError");
    // A call the purse refused reaches verify as a harness failure, which it reads as an unsure verdict; the judge says what it was.
    const refused = purse?.refusal !== undefined && purse.refusal !== refusedBefore ? purse.refusal : undefined;
    if (refused) return { verdict: "not_judged", why: refusedSaid(refused), ...carried, spent: bounded.settled ? spentBy(bounded.value.interventions) : { ...NOTHING_SPENT } };
    if (!bounded.settled) {
      // An abandoned call's spend is not known: it is still running, and its
      // interventions arrive only with its answer.
      const why = bounded.reason === "timed_out"
        ? "The judge did not answer inside its deadline, so the test was not judged."
        : "The judge failed before it answered, so the test was not judged.";
      return { verdict: "not_judged", why, ...carried, spent: { ...NOTHING_SPENT } };
    }
    const spent = spentBy(bounded.value.interventions);
    const outcome = bounded.value.outcome;
    if (!outcome.performed) return { verdict: "not_judged", why: outcome.reason, ...carried, spent };
    if (outcome.verdict === "answers") return { verdict: "yes", spent };
    if (outcome.verdict === "does_not_answer" && automationStudioResultVerificationFailsRun(outcome)) {
      const judgement = outcome.repair?.judgement;
      return {
        verdict: "no",
        ...(judgement?.expected ? { expected: judgement.expected } : {}),
        ...(judgement?.observed ? { observed: judgement.observed } : {}),
        ...(judgement?.advice ? { advice: judgement.advice } : {}),
        findings: (outcome.repair?.findings ?? []).map((finding) => finding.code).filter((code) => !NOT_A_FINDING_OF_A_TEST.has(code)),
        spent
      };
    }
    return { verdict: "unknown", why: outcome.reason, ...carried, spent };
  };
}

/** Why a judge the purse refused did not judge, in the purse's figures. */
function refusedSaid(refusal: AutomationStudioLlmBuildPurseRefusal): string {
  const call = refusal.projectedCostUsd !== undefined ? `the judge's call, which could have cost up to $${refusal.projectedCostUsd.toFixed(3)}` : "the judge's call";
  const left = Math.max(0, refusal.ceilingUsd - refusal.spentUsd - refusal.pendingUsd);
  return `The build's spending limit of $${refusal.ceilingUsd.toFixed(2)} had $${left.toFixed(3)} left, too little for ${call}, so its test was not judged.`;
}

/** What every call cost, summed; a call that reported nothing counts nothing. */
function spentBy(interventions: readonly AutomationStudioFlowIntervention[]): AutomationStudioBuildTestJudgeSpend {
  const spent = { ...NOTHING_SPENT };
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
