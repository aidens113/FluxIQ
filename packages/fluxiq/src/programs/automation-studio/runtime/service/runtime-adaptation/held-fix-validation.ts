// A fix the run held in place, and whether its trial passed (state-aware
// recovery plan, C6 step 8).
//
// An in-run repair overlays its fix at the failing step, and the executor
// re-attempts the unit there: that re-attempt is the fix's trial, the in-run
// equivalent of a detached repair's live trial on a cloned Flow. The root
// trace lists every repair whose overlay the run kept (`trace.repairs`), and
// the attempt that failed carries the repair's id.
//
// A detached patch whose trial was verified is `validated`
// (`../../live-patch.ts`, `adaptationStatusForVerification`); one whose trial
// had nothing to compare stays `testing`. So a held fix is `validated`, with
// its re-attempt recorded as its succeeded trial, only on positive evidence
// that the re-attempt did what its node declares (C6 step 8: the fix holds
// when "the node's expected state ... is `true`"):
//
// - a node that declares an expected state: the host evaluated it and it held.
//   The re-attempt's comparison matched and says the host judged it
//   (`metadata.hostEvaluated`, set only on the host-evaluated path, so an
//   evaluator that threw proves nothing). With no such host the
//   executor reads an expected state from the attempt's own route, which is
//   not evidence the state holds (C9: `unknown` never satisfies), so the fix
//   stays `testing`, as the detached path left an unevaluated check, whatever
//   outputs the step also produced;
// - a node that declares no expected state: the outputs it declares were all
//   observed on the re-attempt.
//
// A match on the route alone, or on effects alone, or a node that declares
// nothing, proved nothing on its own: the fix stays `testing` for the judged
// run to vouch for, as a detached target override with no evidence does
// (t267). The run still carries on with the fix held either way. A fix whose
// trial failed was dropped and is not in `trace.repairs`: it stays `testing`,
// unvalidated.
//
// Validated is not saved. The fix still reaches the stored Flow only through
// the judged-promotion settle (`./judged-promotion.ts`), after the run's judged
// end; a person may also apply it through review, as any validated change.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../storage/index.ts";
import { isJsonRecord } from "../json-values.ts";

const HELD_TRIAL_DETAIL = "The fix was overlaid at its failing step, and the run's re-attempt of the unit there was seen to do what the step declares.";

/** What the root trace says of the run's in-run repairs: the ids it kept, and the attempts that carry them. */
type HeldRepairTrace = { repairs?: string[] | undefined; attempts?: readonly AutomationStudioNodeAttemptTrace[] | undefined };

/**
 * The adaptations of this run's in-run repairs whose overlay the run kept: a
 * receipt names its repair, and the root trace lists every repair whose fix
 * held (`trace.repairs`). A fix whose trial failed was dropped, and did not run.
 */
export function automationStudioRunInRunRepairAdaptationIds(detail: Pick<AutomationStudioFlowRunDetail, "metadata">, keptRepairIds: readonly string[] | undefined): string[] {
  const kept = new Set(keptRepairIds ?? []);
  const receipts = Array.isArray(detail.metadata?.inRunRepairs) ? detail.metadata.inRunRepairs.filter(isJsonRecord) : [];
  return receipts.flatMap((receipt: JsonObject) => (typeof receipt.adaptationId === "string" && typeof receipt.repairId === "string" && kept.has(receipt.repairId) ? [receipt.adaptationId] : []));
}

/**
 * Moves each held fix whose trial passed from `testing` to `validated`,
 * recording the run's re-attempt as its succeeded trial, and answers the ids
 * it moved. Anything else -- applied, rejected, already validated -- is left as
 * it is. A store that went away leaves the rest unvalidated: the settle that
 * follows meets the same store and records it on the session.
 */
export async function validateAutomationStudioHeldInRunRepairs(input: {
  ports: {
    getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
    saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation>;
  };
  projectId: string;
  flowId: string;
  session: Pick<AutomationStudioRuntimeSession, "runId"> & { trace?: HeldRepairTrace | undefined };
  detail: Pick<AutomationStudioFlowRunDetail, "metadata">;
}): Promise<string[]> {
  const attempts = input.session.trace?.attempts ?? [];
  const passed = (input.session.trace?.repairs ?? []).filter((repairId) => trialPassed(attempts, repairId));
  const validated: string[] = [];
  try {
    for (const adaptationId of automationStudioRunInRunRepairAdaptationIds(input.detail, passed)) {
      const adaptation = await input.ports.getFlowAdaptation(input.projectId, input.flowId, adaptationId);
      if (adaptation?.status !== "testing") continue;
      await input.ports.saveFlowAdaptation(withHeldTrial(adaptation, input.session.runId, Date.now()));
      validated.push(adaptationId);
    }
  } catch (error) {
    if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
  }
  return validated;
}

/**
 * Whether the fix's re-attempt passed: in the frame whose attempt carries the
 * repair, a later attempt of the same node succeeded with positive evidence of
 * what the node declares. A child frame's attempts are read from its Call
 * Subflow attempt.
 */
function trialPassed(attempts: readonly AutomationStudioNodeAttemptTrace[], repairId: string): boolean {
  const at = attempts.findIndex((attempt) => attempt.repair?.repairId === repairId);
  const failed = attempts[at];
  if (!failed) return attempts.some((attempt) => trialPassed(attempt.childTrace?.attempts ?? [], repairId));
  const frame = (failed.framePath ?? []).join("/");
  return attempts.slice(at + 1).some((attempt) => attempt.nodeId === failed.nodeId && (attempt.framePath ?? []).join("/") === frame && attempt.status === "succeeded" && provedDeclared(attempt));
}

/**
 * A matched comparison with positive evidence: a declared expected state the
 * host evaluated, or, with none declared, declared outputs all observed. Never
 * the route or the status every step is expected to end in.
 */
function provedDeclared(attempt: AutomationStudioNodeAttemptTrace): boolean {
  const comparison = attempt.transitionComparison;
  if (comparison?.status !== "matched") return false;
  const { expectedOutputs, expectedState } = comparison.expected;
  if (Object.keys(expectedState ?? {}).length > 0) return comparison.metadata?.hostEvaluated === true;
  const declaredOutputs = Object.keys(expectedOutputs ?? {});
  return declaredOutputs.length > 0 && declaredOutputs.every((outputId) => !comparison.diffSummary?.missingOutputIds.includes(outputId));
}

function withHeldTrial(adaptation: AutomationStudioFlowAdaptation, runId: string, now: number): AutomationStudioFlowAdaptation {
  const trial = { runId, status: "succeeded" as const, checkedAt: now, kind: "trial" as const, basis: ["in_run_trial"], detail: HELD_TRIAL_DETAIL };
  return { ...adaptation, status: "validated", updatedAt: now, validationResults: [...(adaptation.validationResults ?? []), trial] };
}
