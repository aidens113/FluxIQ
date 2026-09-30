// An incomplete draft read back from storage.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraft } from "./record.ts";

/**
 * The most steps a stored record may hold. A kept draft is one build's
 * proposable steps plus any it continued: at most a whole Flow, one step in
 * every loop iteration, and the iteration-zero observation. It is there only
 * so a damaged file cannot seed a build with an unbounded list.
 *
 * Bounded by the Flow size setting's largest value, not the Flow's own: the
 * reader is handed only the owner's ids, and a draft kept while the Flow's
 * setting was higher must still seed a build after it is lowered -- the
 * build's own validation refuses what the current setting does not allow.
 */
const MAX_STEPS = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes
  + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations
  + 1;
const STOPPED: readonly string[] = ["iterations", "budget", "tool_calls", "unusable_decisions"];
const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;
const OPTIONAL_OBJECTS = ["ranWith", "settings", "replay", "routing"] as const;
const OPTIONAL_STRINGS = ["id", "toolId", "resultCode", "stateBefore", "stateAfter"] as const;

/**
 * The record, or `null` for anything that is not one written for this Flow.
 *
 * A stored draft seeds a build, so a record that has been damaged or edited is
 * refused whole rather than partly read: a continuation started from half a
 * draft would be told it owed less than it did. `null` is not an error; the
 * build starts from nothing, as it did before this record existed.
 */
export function parseAutomationStudioFlowBootstrapIncompleteDraft(
  value: unknown,
  owner: { projectId: string; flowId: string }
): AutomationStudioFlowBootstrapIncompleteDraft | null {
  if (!isRecord(value) || value.kind !== "flow_bootstrap_incomplete_draft" || value.status !== "incomplete") return null;
  if (value.projectId !== owner.projectId || value.flowId !== owner.flowId) return null;
  if (!positiveInteger(value.revision) || typeof value.baseDependencyDigest !== "string" || !value.baseDependencyDigest) return null;
  if (!stringList(value.sourceInstructionIds) || !stringList(value.outstandingIssueCodes) || !value.outstandingIssueCodes.every((code) => ISSUE_CODE.test(code))) return null;
  if (typeof value.stopped !== "string" || !STOPPED.includes(value.stopped)) return null;
  if (!Number.isSafeInteger(value.completionAttempts) || (value.completionAttempts as number) < 0) return null;
  if (!Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt)) return null;
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > MAX_STEPS) return null;
  const steps: AutomationStudioFlowDraftStep[] = [];
  for (const [index, step] of value.steps.entries()) {
    if (!keptStep(step, index + 1)) return null;
    steps.push(structuredClone(step));
  }
  return {
    kind: "flow_bootstrap_incomplete_draft",
    status: "incomplete",
    projectId: owner.projectId,
    flowId: owner.flowId,
    revision: value.revision,
    baseDependencyDigest: value.baseDependencyDigest,
    sourceInstructionIds: [...value.sourceInstructionIds],
    stopped: value.stopped as AutomationStudioFlowBootstrapIncompleteDraft["stopped"],
    outstandingIssueCodes: [...value.outstandingIssueCodes],
    completionAttempts: value.completionAttempts as number,
    steps,
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number
  };
}

/** A step as `./kept.ts` writes one: in place, kept, and with nothing of the call that took it. */
function keptStep(value: unknown, position: number): value is AutomationStudioFlowDraftStep {
  if (!isRecord(value) || value.position !== position || value.iteration !== 0 || value.disposition !== "kept") return false;
  if (typeof value.actionId !== "string" || !value.actionId || !isRecord(value.input)) return false;
  if (value.effect !== "observe" && value.effect !== "mutate") return false;
  if (value.callId !== undefined || value.replayed !== undefined) return false;
  if (value.effectApplied !== undefined && typeof value.effectApplied !== "boolean") return false;
  if (value.proposes !== undefined && typeof value.proposes !== "boolean") return false;
  return OPTIONAL_OBJECTS.every((key) => value[key] === undefined || isRecord(value[key]))
    && OPTIONAL_STRINGS.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
