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
// before a provider is even resolved.
//
// **An empty result is judged like any other, and that is new.** Until
// 2026-09-24 a run that stored no rows -- an empty record set, or no record set
// at all -- was exempt: it was recorded as not checked and never put to a
// model, because a verification reached from an empty result had once entered
// provider resolution and never returned (2026-09-20, t024). That exemption
// made the single most obviously wrong answer a run can give -- an empty table
// where the person asked for rows -- the one case nothing ever looked at, and
// because nothing refuted it, nothing repaired it either. The hang is now
// bounded rather than avoided (`deadline.ts`), and an empty result reaches the
// same question every other result reaches. It can be answered `yes`: "if
// nothing matches, an empty table is the right answer" is a request a Flow
// satisfies by finding nothing, and only a reading of the request tells that
// from an extraction that found nothing because it never looked.
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
  automationStudioLlmJudgeTokenLimits,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../llm/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "./contracts.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain } from "./agreement.ts";
import { automationStudioResultCheckActivity } from "./check-activity.ts";
import { automationStudioResultCoreObservation } from "./core-observation.ts";
import { automationStudioResultSummaryWithUnreadColumns } from "./read-account/index.ts";
import { automationStudioResultVerdict } from "./verdict.ts";
import { emitAutomationStudioActivity } from "../activity/index.ts";

/**
 * Core's codes for a run that was not verified, and why. Never a verdict.
 *
 * Two codes used to live here and no longer do, because the cases they named
 * are now judged rather than skipped: `core.result.nothing_to_judge`, for a run
 * that stored no record set, and `core.result.no_records`, for a record set
 * holding no rows. Both are still readable on runs recorded before 2026-09-24,
 * and `verification-status.ts` still maps the first to the `no_result` status a
 * stored run may carry; nothing produces either any more.
 *
 * What is left is the two ways a question can fail to be put at all: no model
 * to put it to, and a verification that did not finish inside its deadline
 * (`deadline.ts`). Both are `performed: false`, both read as `unverified`, and
 * neither is ever a pass.
 */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES = Object.freeze({
  noModel: "core.result.no_model_available",
  /** The verification did not settle inside its deadline, or the run was cancelled under it. */
  notFinished: "core.result.verification_did_not_finish"
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

/** The title of the check's rows in the chat, the same on its start and its end so the two are one card. */
const RESULT_CHECK_TITLE = "Result check";

export async function verifyAutomationStudioRunResult(request: AutomationStudioResultVerificationRequest): Promise<AutomationStudioResultVerificationReport> {
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
  // One title for the check's start and its end: a card is keyed by it, and
  // "Result check started" opened an empty "Check result" card above the
  // verdict's (t193 1002-M, `run-murzln6g-11debe1d`, C11).
  emitAutomationStudioActivity({ phase: "verifying", label: "Checking the result answers the request", detail: { kind: "check", title: RESULT_CHECK_TITLE, status: "started" } });
  const first = await askOnce(request, provider, 1);
  if (!automationStudioResultVerificationAskAgain(first.verification)) {
    return said({ outcome: { ...automationStudioResultVerificationAgreement({ first: first.verification }), performed: true }, interventions: [first.intervention] });
  }
  const second = await askOnce(request, provider, 2);
  // Two calls can finish within one millisecond of each other, and the
  // harness names an intervention by the run and the time.
  const secondIntervention = second.intervention.interventionId === first.intervention.interventionId
    ? { ...second.intervention, interventionId: `${second.intervention.interventionId}.2` }
    : second.intervention;
  return said({
    outcome: { ...automationStudioResultVerificationAgreement({ first: first.verification, second: second.verification }), performed: true },
    interventions: [first.intervention, secondIntervention]
  });
}

/** The check's verdict, said in the chat as the check that was started ends (`check-activity.ts`), and returned unchanged. */
function said(report: AutomationStudioResultVerificationReport): AutomationStudioResultVerificationReport {
  const words = automationStudioResultCheckActivity(report.outcome);
  emitAutomationStudioActivity({ phase: "verifying", label: words.label, detail: { kind: "check", title: RESULT_CHECK_TITLE, status: words.status, ...(words.text ? { text: words.text } : {}) } });
  return report;
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
    // With the instruction's named columns no stored column reads, said once
    // (`read-account/unread-columns.ts`): information for the judge, not a verdict.
    resultSummary: automationStudioResultSummaryWithUnreadColumns(request.summary, request.instructions),
    ...(request.deniedEvidenceKeys ? { deniedEvidenceKeys: request.deniedEvidenceKeys } : {}),
    ...(request.policy ? { policy: request.policy } : {}),
    provider,
    ...(request.runBudget ? { runBudget: request.runBudget } : {}),
    // A judge's reply is held at a judge's size, never the 8,000-token default: under a build's purse the hold is the reply allowance (`../llm/harness/token-limits.ts`, run 38's C7).
    ...withDefined("tokenLimits", automationStudioLlmJudgeTokenLimits(request.tokenLimits)),
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
    // The reply's own prose, carried only as the judgement's advice where the
    // diagnosis channel's `changed` gave none. The verdict reader screens and
    // bounds it; nothing here is required of the model.
    ...(response?.summary ? { summaryText: response.summary } : {}),
    basis: response ? "model" : "model_unavailable",
    ...(response ? {} : { failureCode: firstErrorCode(result.diagnostics) })
  });
  // The harness records a call's own metadata, not the caller's, so the
  // intervention is told here which check it was and who asked.
  const intervention = { ...result.intervention, metadata: { ...(result.intervention.metadata ?? {}), source: VERIFICATION_SOURCE, verificationCheck: check } };
  return { verification, intervention };
}

/** `{ [key]: value }`, or nothing when the value is undefined, for an optional field that may not be set to `undefined`. */
function withDefined<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/** The first error code a failed call reported. Codes only: a provider's message never reaches a run record. */
function firstErrorCode(diagnostics: readonly { severity: string; code: string }[]): string | undefined {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error")?.code;
}
