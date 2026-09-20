// One question, asked once, after a run has finished: does what came back
// answer what was asked for?
//
// **One call, never a loop.** A verification is not an investigation. It is
// shown the request, the shape of the Flow that ran, and a bounded account of
// the result, and it answers in one field. If it cannot tell from that, the
// answer is `unknown` and the run fails closed -- asking again with the same
// evidence would only buy the same answer at twice the price.
//
// **Core's own counts are asked first and cost nothing.** A run that stored no
// rows, or whose every row was refused, is settled before a provider is even
// resolved, so the two failures that need no judgement never spend a call.
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
import { automationStudioResultCoreObservation } from "./core-observation.ts";
import { automationStudioResultVerdict } from "./verdict.ts";

/** Core's codes for a run that was not verified, and why. Never a verdict. */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES = Object.freeze({
  noResult: "core.result.nothing_to_judge",
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

/** The outcome, and the intervention record of the one call, when one was made. */
export type AutomationStudioResultVerificationReport = {
  outcome: AutomationStudioResultVerificationOutcome;
  intervention?: AutomationStudioFlowIntervention;
};

export async function verifyAutomationStudioRunResult(request: AutomationStudioResultVerificationRequest): Promise<AutomationStudioResultVerificationReport> {
  const skipped = nothingToJudge(request.summary);
  if (skipped) return { outcome: skipped };
  const core = automationStudioResultCoreObservation(request.summary);
  if (core) return { outcome: { ...core, performed: true } };
  if (!request.provider) {
    return {
      outcome: {
        schemaVersion: "automation-studio.result-verification.v1",
        performed: false,
        code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noModel,
        reason: "No model was available to judge this run's result -- none is configured for this Flow, or this run was not authorized to ask one -- so whether the result answers the request was never judged."
      }
    };
  }
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
    provider: request.provider,
    ...(request.runBudget ? { runBudget: request.runBudget } : {}),
    ...(request.tokenLimits ? { tokenLimits: request.tokenLimits } : {}),
    ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    ...(request.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: request.maxEstimatedCostUsd } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    ...(request.now ? { now: request.now } : {}),
    metadata: { source: "verifyAutomationStudioRunResult", expectedOutput: "diagnosis" }
  });
  const response = result.ok && result.response?.kind === "diagnosis" ? result.response : undefined;
  const verification = automationStudioResultVerdict({
    summary: request.summary,
    ...(response?.diagnosis ? { diagnosis: response.diagnosis } : {}),
    basis: response ? "model" : "model_unavailable",
    ...(response ? {} : { failureCode: firstErrorCode(result.diagnostics) })
  });
  return { outcome: { ...verification, performed: true }, intervention: result.intervention };
}

/**
 * Whether there is a result to judge at all.
 *
 * A Flow that stores no records has no result in this sense -- it signed in, or
 * pressed something, and its own steps are the only account of whether it
 * worked. Saying so is not the same as passing it: the run records that nothing
 * was judged and why, and `performed: false` is a different fact from a verdict
 * of `answers`.
 */
function nothingToJudge(summary: AutomationStudioRunResultSummary): AutomationStudioResultVerificationOutcome | undefined {
  if (summary.totalRecordCount > 0 || summary.totalRefusedCount > 0) return undefined;
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
