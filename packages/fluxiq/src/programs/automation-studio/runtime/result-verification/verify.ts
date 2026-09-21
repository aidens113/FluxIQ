// One question, asked after a run has finished: does what came back answer
// what was asked for?
//
// **At most two calls, never a loop.** A verification is not an investigation.
// It is shown the request, the shape of the Flow that ran, and a bounded account
// of the result, and it answers in one field: `yes`, `no` or `unknown`.
//
// **Anything but `yes` is asked once more, with the same evidence.** A `no`
// or an `unknown` fails a run whose every step succeeded, and at temperature 0
// both were measured to flip on identical rows (2026-09-18, 2026-09-21). The
// second call is the first one repeated, not a new question; `agreement.ts`
// says what the two answers come to. Only two agreeing `no`s fail the run;
// every other pair that is not a `yes` first leaves it `unverified`. A first
// call that gave no answer at all is not repeated and fails closed.
//
// **Core's own counts are asked first and cost nothing.** A run whose every row
// was refused, or whose rows lack a value their own schema requires, is settled
// before a provider is even resolved. A run that stored a record set with no
// rows in it is recorded as not checked (`core.result.no_records`), never as
// a pass, and never reaches provider resolution: judging an empty result
// against the instruction is not done here (see `nothingToJudge`).
//
// **`loop_verification` is the task kind, and it needed no new output shape.**
// The kind has existed since the loop protocol was written -- described in its
// own file as "a verdict on whether a change worked" -- and was never called.
// It expects the diagnosis envelope, which already carries three-word verdicts;
// the verdict this call is for is one more of them, `answersRequest`. That is
// the whole of the extension: one field in a channel that is already named,
// bounded, schema-declared and checked at the boundary.
//
// **The call is deliberately made outside the stage protocol.** The protocol's
// order starts at `gather` and a run may not begin part-way through it, so a
// standalone `verify` would be refused by Core's own ordering rule and the
// refusal would be right: this is not the fifth stage of a recovery, it is a
// check every finished run gets whether or not a recovery ever happened.

import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowInstruction, AutomationStudioFlowIntervention, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import {
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../llm/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "./contracts.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain } from "./agreement.ts";
import { AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES, automationStudioResultCoreObservation } from "./core-observation.ts";
import { automationStudioResultVerdict } from "./verdict.ts";

/** Core's codes for a run that was not verified, and why. Never a verdict. */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES = Object.freeze({
  noResult: "core.result.nothing_to_judge",
  /** A record set was stored and holds no rows: an empty result, recorded as not checked. */
  noRecords: AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES.noRecords,
  noModel: "core.result.no_model_available"
} as const);

export type AutomationStudioResultVerificationRequest = {
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string | undefined;
  /** What the run produced, already bounded and screened. */
  summary: AutomationStudioRunResultSummary;
  /** The request, as the Flow's own instructions state it. */
  instructions: readonly AutomationStudioFlowInstruction[];
  /** The finished run, for the steps it actually attempted. */
  runDetail?: AutomationStudioFlowRunDetail | undefined;
  /** The bound domain's declared denied keys. Required once anything is sent. */
  deniedEvidenceKeys?: readonly string[] | undefined;
  provider?: AutomationStudioLlmProvider | undefined;
  policy?: AutomationStudioAdaptationPolicy | undefined;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
  timeoutMs?: number | undefined;
  maxEstimatedCostUsd?: number | undefined;
  runBudget?: AutomationStudioLlmRunBudgetLedger | undefined;
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
};

/** The outcome, and the intervention record of each call made: none, one, or two. */
export type AutomationStudioResultVerificationReport = {
  outcome: AutomationStudioResultVerificationOutcome;
  /**
   * In the order the calls were made. Each carries
   * `metadata.source: "verifyAutomationStudioRunResult"` and
   * `metadata.verificationCheck` (1 or 2), so a reader of the run can tell a
   * verification call from a recovery's.
   */
  interventions: AutomationStudioFlowIntervention[];
};

/** Where a verification call's intervention says it came from. */
const VERIFICATION_SOURCE = "verifyAutomationStudioRunResult";

export async function verifyAutomationStudioRunResult(request: AutomationStudioResultVerificationRequest): Promise<AutomationStudioResultVerificationReport> {
  const skipped = nothingToJudge(request.summary);
  if (skipped) return { outcome: skipped, interventions: [] };
  const core = automationStudioResultCoreObservation(request.summary);
  if (core) return { outcome: { ...core, performed: true }, interventions: [] };
  const provider = request.provider;
  if (!provider) {
    return {
      interventions: [],
      outcome: {
        schemaVersion: "automation-studio.result-verification.v1",
        performed: false,
        code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noModel,
        reason: "No model was available to judge this run's result -- none is configured for this Flow, or this run was not authorized to ask one -- so whether the result answers the request was never judged."
      }
    };
  }
  const first = await askOnce(request, provider, 1);
  if (!automationStudioResultVerificationAskAgain(first.verification)) {
    return { outcome: { ...automationStudioResultVerificationAgreement({ first: first.verification }), performed: true }, interventions: [first.intervention] };
  }
  const second = await askOnce(request, provider, 2);
  // Two calls can finish within one millisecond of each other, and the
  // harness names an intervention by the run and the time.
  const secondIntervention = second.intervention.interventionId === first.intervention.interventionId
    ? { ...second.intervention, interventionId: `${second.intervention.interventionId}.2` }
    : second.intervention;
  return {
    outcome: { ...automationStudioResultVerificationAgreement({ first: first.verification, second: second.verification }), performed: true },
    interventions: [first.intervention, secondIntervention]
  };
}

/**
 * One verification call and the verdict it reached. The second call of a
 * verification is this one repeated: the same request, the same evidence.
 */
async function askOnce(
  request: AutomationStudioResultVerificationRequest,
  provider: AutomationStudioLlmProvider,
  check: 1 | 2
): Promise<{ verification: ReturnType<typeof automationStudioResultVerdict>; intervention: AutomationStudioFlowIntervention }> {
  const result = await runAutomationStudioLlmHarness({
    taskKind: "loop_verification",
    projectId: request.projectId,
    flowId: request.flowId,
    runId: request.runId,
    ...(request.subflowId ? { subflowId: request.subflowId } : {}),
    instructions: [...request.instructions],
    ...(request.runDetail ? { runDetail: request.runDetail } : {}),
    resultSummary: request.summary,
    ...(request.deniedEvidenceKeys ? { deniedEvidenceKeys: request.deniedEvidenceKeys } : {}),
    ...(request.policy ? { policy: request.policy } : {}),
    provider,
    ...(request.runBudget ? { runBudget: request.runBudget } : {}),
    ...(request.tokenLimits ? { tokenLimits: request.tokenLimits } : {}),
    ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    ...(request.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: request.maxEstimatedCostUsd } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    ...(request.now ? { now: request.now } : {}),
    metadata: { source: VERIFICATION_SOURCE, expectedOutput: "diagnosis" }
  });
  const response = result.ok && result.response?.kind === "diagnosis" ? result.response : undefined;
  const verification = automationStudioResultVerdict({
    summary: request.summary,
    ...(response?.diagnosis ? { diagnosis: response.diagnosis } : {}),
    basis: response ? "model" : "model_unavailable",
    ...(response ? {} : { failureCode: firstErrorCode(result.diagnostics) })
  });
  // The harness records a call's own metadata, not the caller's, so the
  // intervention is told here which check it was and who asked.
  const intervention = { ...result.intervention, metadata: { ...(result.intervention.metadata ?? {}), source: VERIFICATION_SOURCE, verificationCheck: check } };
  return { verification, intervention };
}

/**
 * Whether there is a result to judge at all.
 *
 * A Flow that stores no record set has no result in this sense -- it signed in,
 * or pressed something, and its own steps are the only account of whether it
 * worked. Saying so is not the same as passing it: the run records that nothing
 * was judged and why, and `performed: false` is a different fact from a verdict
 * of `answers`.
 *
 * A record set with no rows in it is an empty result, and it is not judged
 * either -- but it is never allowed to read as nothing having happened. It is
 * recorded as `core.result.no_records`, not checked, and the run keeps the
 * status its steps earned. It is not failed outright, because an empty table
 * is sometimes the right answer ("if every product has been delisted, an
 * empty table is the right answer"), and it is not put to the model, because
 * a verification call reached from an empty result revalidated an
 * already-spent grant and never returned (2026-09-20, t024). Judging an empty
 * result against the instruction waits on that hang being fixed.
 */
function nothingToJudge(summary: AutomationStudioRunResultSummary): AutomationStudioResultVerificationOutcome | undefined {
  if (summary.totalRecordCount > 0 || summary.totalRefusedCount > 0) return undefined;
  if (summary.recordSetCount > 0) {
    return {
      schemaVersion: "automation-studio.result-verification.v1",
      performed: false,
      code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noRecords,
      reason: "Nothing was stored, so the result was not checked: the run's record set holds no rows, and whether an empty result answers the request was never judged."
    };
  }
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: false,
    code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noResult,
    reason: "The run stored no record set, so it produced no result for a verification to judge."
  };
}

/** The first error code a failed call reported. Codes only: a provider's message never reaches a run record. */
function firstErrorCode(diagnostics: readonly { severity: string; code: string }[]): string | undefined {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error")?.code;
}
