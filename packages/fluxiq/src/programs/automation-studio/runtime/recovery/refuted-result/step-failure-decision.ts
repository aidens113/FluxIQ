// Whether a run that failed at a step goes back to the build loop.
//
// **The finding this acts on (t193-wK, cause C2).** In 13 live runs a step
// failed because the control it acts on was not found, or not told apart from
// others, on a redesigned site. The run's recovery -- the patch ladder
// (`recovery/annotation/annotate.ts`) -- then ended with nothing executed: the
// model said the step's goal could no longer be reached, or asked for no patch,
// or returned a target override the domain's equivalence check refused, or
// returned a patch that did not validate. And the run simply failed. The only
// route back into the build loop was the wrong-answer route (`reauthor.ts`),
// which a run that failed at a step never reaches.
//
// Those refusals are correct: a target override may only re-point a step at a
// control equivalent to the one recorded, and the redesign replaced that control
// with a differently named one ("Write something..." became "Create post") or
// moved it behind a menu. No runtime patch can express either. The loop that
// finds steps can, so the Flow is re-authored, starting from itself.
//
// **What is read.** Everything is read off the run record the ladder wrote;
// nothing is asked of a model. The conditions, all of which must hold:
//
// - the run failed, at a step whose failure record parses;
// - that failure is target-level (`step-failure-target.ts`);
// - the ladder ran -- it reached a model (`llmGate.invoked`) -- and executed
//   no patch and made no adaptation;
// - it stopped for none of the reasons that must end a repair: a question for
//   the person, or a cost or budget bound;
// - no earlier pass of this run already re-authored it for a failed step;
// - the Flow to extend is in hand.
//
// A run any of this does not hold for is left exactly as it was: the decision
// says why, and nothing is written.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "./reauthor.ts";
import { automationStudioStepFailureTarget } from "./step-failure-target.ts";

/** What a re-author for a failed step is recorded under, on its attempt's brief record. */
const FAILED_STEP_TRIGGER = "failed_step";

/** The ladder's own code for a patch it held for a person's permission. */
const PERMISSION_REQUIRED_CODE = "llm.runtime_patch_permission_required";

/** The ladder declined for one of these: only a person can settle it, so no rebuilt Flow can. */
const PERSON_DECLINES: ReadonlySet<string> = new Set(["person_required", "control_refused"]);

/** Why a failed run was not re-authored, in codes a reader can key on. */
export type AutomationStudioStepFailureReauthorRefusal =
  | "run_not_failed"
  | "no_failed_step"
  | "not_target_level"
  | "ladder_not_run"
  | "ladder_patch_executed"
  | "permission_required"
  | "cost_bound"
  | "already_reauthored"
  | "flow_unavailable";

export type AutomationStudioStepFailureReauthorDecision =
  | {
      route: true;
      projectId: string;
      flowId: string;
      /** The failed step's attempt, as the run recorded it. */
      attempt: AutomationStudioFlowRunActionAttemptRecord;
      /** Codes only, for the run record: what failed and how the ladder ended. */
      record: JsonObject;
    }
  | { route: false; refusal: AutomationStudioStepFailureReauthorRefusal };

/**
 * The port the verification calls for a run that failed at a step.
 *
 * It answers the run with the attempt recorded and whether the Flow was
 * changed, or nothing when the run was not routed -- in which case nothing was
 * written and the failed run stands exactly as the ladder left it.
 */
export type AutomationStudioFailedStepRepairPort = (input: {
  /** The run as the ladder left it. */
  detail: AutomationStudioFlowRunDetail;
  /** The failed step's live trace attempt, for what the step was expected to produce. */
  failedTraceAttempt?: AutomationStudioNodeAttemptTrace | undefined;
  /** The Flow that ran, for the failed step's authored parameters. */
  flow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
  /** The bound domain's denied keys; absent withholds every authored parameter from the brief. */
  deniedEvidenceKeys?: readonly string[] | undefined;
}) => Promise<{ detail: AutomationStudioFlowRunDetail; reauthored: boolean } | undefined>;

/**
 * Whether this failed run re-enters the build loop, and with what.
 *
 * Every condition is read off the run the ladder wrote. The order is the order
 * a reader would ask in: was there a failed step, was it one a re-author
 * answers, did the ladder try and fail, did anything forbid going further.
 */
export function automationStudioStepFailureReauthorDecision(input: {
  detail: AutomationStudioFlowRunDetail;
  projectId?: string | undefined;
  flowId?: string | undefined;
}): AutomationStudioStepFailureReauthorDecision {
  const detail = input.detail;
  if (detail.summary.status !== "failed") return refused("run_not_failed");
  const failed = automationStudioStepFailureTarget(detail.actionAttempts);
  if (!failed) return refused("no_failed_step");
  if (!failed.targetLevel) return refused("not_target_level");
  const { attempt, failure } = failed;
  const metadata = detail.metadata ?? {};
  const gate = record(metadata.llmGate);
  if (gate?.invoked !== true) return refused("ladder_not_run");
  const patches = records(metadata.runtimePatchAttempts);
  if (patches.some((patch) => patch.executed === true || typeof patch.adaptationId === "string") || record(metadata.adaptiveRetry)?.attempted === true) {
    return refused("ladder_patch_executed");
  }
  if (metadata.permissionRequest !== undefined || gate.patchSkippedCode === PERMISSION_REQUIRED_CODE || gate.patchHeldCode === PERMISSION_REQUIRED_CODE || (typeof gate.patchDeclined === "string" && PERSON_DECLINES.has(gate.patchDeclined))) {
    return refused("permission_required");
  }
  const ladder = ladderEnd(gate, record(metadata.recoveryTrace), patches);
  if (costBound(gate, ladder, record(metadata.recoveryTrace))) return refused("cost_bound");
  if (alreadyReauthored(detail)) return refused("already_reauthored");
  if (!input.projectId || !input.flowId) return refused("flow_unavailable");
  return {
    route: true,
    projectId: input.projectId,
    flowId: input.flowId,
    attempt,
    record: {
      trigger: FAILED_STEP_TRIGGER,
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      failureCategory: failure.category,
      failureCode: failure.code,
      ladder
    }
  };
}

/**
 * How the ladder ended, in its own codes: the plan's skip code, the
 * resolution's failure code, each target override the domain refused and why,
 * and the model's own refusal. Each is absent when the ladder did not reach it.
 */
function ladderEnd(gate: JsonObject, trace: JsonObject | undefined, patches: readonly JsonObject[]): JsonObject {
  const resolution = records(trace?.stages).find((stage) => stage.stage === "resolution");
  const failureCode = record(resolution?.detail)?.failureCode;
  const targetRefusals = patches.map((patch) => record(patch.targetOverrideRefusal)?.reason).filter((reason): reason is string => typeof reason === "string");
  const invalid = patches.filter((patch) => patch.preflightOk === false && patch.kind !== "no_repair").length;
  return {
    ...(typeof gate.patchSkippedCode === "string" ? { skipCode: gate.patchSkippedCode } : {}),
    ...(typeof gate.patchSkippedRung === "string" ? { skipRung: gate.patchSkippedRung } : {}),
    ...(typeof failureCode === "string" ? { failureCode } : {}),
    ...(targetRefusals.length ? { targetRefusals } : {}),
    ...(invalid ? { patchesRefused: invalid } : {}),
    ...(typeof gate.patchDeclined === "string" ? { declined: gate.patchDeclined } : {})
  };
}

/**
 * Whether money or a budget ended the ladder. Any code of the run ledger's own
 * (`llm_budget.*`) on the gate or the resolution, a gate that says it was bound
 * by cost, or an exploration the budget ended: the run was told to stop
 * spending, and a re-author is more spending.
 */
function costBound(gate: JsonObject, ladder: JsonObject, trace: JsonObject | undefined): boolean {
  if (gate.bound === "cost") return true;
  const codes: JsonValue[] = [gate.code, ladder.skipCode, ladder.failureCode, ...records(gate.diagnostics).map((diagnostic) => diagnostic.code)].filter((code): code is JsonValue => code !== undefined);
  if (codes.some((code) => typeof code === "string" && code.startsWith("llm_budget."))) return true;
  const exploration = records(trace?.stages).find((stage) => stage.stage === "exploration");
  return record(exploration?.detail)?.outcome === "budget_exhausted";
}

/** Whether an earlier pass of this run already re-authored it for a failed step: once per run. */
function alreadyReauthored(detail: AutomationStudioFlowRunDetail): boolean {
  const attempts = records(record(detail.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY])?.attempts);
  return attempts.some((attempt) => record(attempt.brief)?.trigger === FAILED_STEP_TRIGGER);
}

function refused(refusal: AutomationStudioStepFailureReauthorRefusal): AutomationStudioStepFailureReauthorDecision {
  return { route: false, refusal };
}

function record(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function records(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is JsonObject => item !== undefined) : [];
}
