// What an attempt trace says of state-aware recovery, projected onto the run
// detail (state-aware recovery plan, C11): the frames the attempt ran in, what
// its failure counted as, where its frame began, and the lifecycle handler
// that ran at it. Ids, closed codes and times only: a handler's resolved
// outputs and any page text never reach the run detail.
//
// Session traces are read back from storage, so each field is parsed, not
// typed, and a field with anything outside Core's closed shapes is dropped
// whole rather than half kept.
import type {
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunConditionEvidence,
  AutomationStudioFlowRunFactTruth,
  AutomationStudioFlowRunHandlerDisposition,
  AutomationStudioFlowRunLifecycleEvent
} from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

type RecoveryFields = Pick<AutomationStudioFlowRunActionAttemptRecord, "framePath" | "failureClass" | "entry" | "lifecycle">;

/** An id: no whitespace, at most 200 characters. */
const ID = /^[^\s]{1,200}$/u;
/** An occurrence key or an evidence reference: no whitespace, at most 1,000 characters. */
const REF = /^[^\s]{1,1000}$/u;
const FAILURE_CLASSES: ReadonlySet<unknown> = new Set(["true_failure", "planned_fail", "retry", "skip", "state_route", "uncertain"]);
const EVENTS: ReadonlySet<unknown> = new Set(["start", "before", "retry", "fail", "before_next"]);
const TRUTHS: ReadonlySet<unknown> = new Set(["true", "false", "unknown"]);
const ENTRY_KINDS: ReadonlySet<unknown> = new Set(["default", "entry", "checkpoint"]);

/** The run detail's recovery fields for one attempt; each is absent when the trace has none or it is malformed. */
export function automationStudioRunDetailRecoveryTrace(attempt: AutomationStudioNodeAttemptTrace): RecoveryFields {
  const trace = attempt as unknown as Record<string, unknown>;
  const framePath = framePathOf(trace.framePath);
  const failureClass = FAILURE_CLASSES.has(trace.failureClass) ? trace.failureClass as RecoveryFields["failureClass"] : undefined;
  const entry = entryOf(trace.entry);
  const lifecycle = lifecycleOf(trace.lifecycle);
  return {
    ...(framePath ? { framePath } : {}),
    ...(failureClass ? { failureClass } : {}),
    ...(entry ? { entry } : {}),
    ...(lifecycle ? { lifecycle } : {})
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function framePathOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.length || !value.every((id) => typeof id === "string" && ID.test(id))) return undefined;
  return [...value] as string[];
}

function evidenceOf(value: unknown): AutomationStudioFlowRunConditionEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const evidence: AutomationStudioFlowRunConditionEvidence[] = [];
  for (const item of value) {
    const fields = record(item);
    if (!fields || !TRUTHS.has(fields.truth) || typeof fields.capturedAt !== "number" || !Number.isFinite(fields.capturedAt)) return undefined;
    if (fields.evidenceRef !== undefined && (typeof fields.evidenceRef !== "string" || !REF.test(fields.evidenceRef))) return undefined;
    evidence.push({ truth: fields.truth as AutomationStudioFlowRunFactTruth, ...(fields.evidenceRef !== undefined ? { evidenceRef: fields.evidenceRef as string } : {}), capturedAt: fields.capturedAt });
  }
  return evidence;
}

function entryOf(value: unknown): RecoveryFields["entry"] {
  const fields = record(value);
  if (!fields || !ENTRY_KINDS.has(fields.kind)) return undefined;
  const evidence = evidenceOf(fields.evidence);
  if (!evidence) return undefined;
  const kind = fields.kind as "default" | "entry" | "checkpoint";
  if (kind === "default") return { kind, evidence };
  if (typeof fields.id !== "string" || !ID.test(fields.id)) return undefined;
  return { kind, id: fields.id, evidence };
}

function dispositionOf(value: unknown): AutomationStudioFlowRunHandlerDisposition | undefined {
  const fields = record(value);
  if (!fields) return undefined;
  if (fields.kind === "resume" || fields.kind === "resolve" || fields.kind === "unhandled") return { kind: fields.kind };
  if (fields.kind === "route" && typeof fields.checkpointId === "string" && ID.test(fields.checkpointId)) return { kind: "route", checkpointId: fields.checkpointId };
  return undefined;
}

function lifecycleOf(value: unknown): RecoveryFields["lifecycle"] {
  const fields = record(value);
  if (!fields || !EVENTS.has(fields.event) || !TRUTHS.has(fields.completionCheck)) return undefined;
  if (typeof fields.handlerId !== "string" || !ID.test(fields.handlerId) || typeof fields.occurrence !== "string" || !REF.test(fields.occurrence)) return undefined;
  const conditionEvidence = evidenceOf(fields.conditionEvidence);
  const disposition = dispositionOf(fields.disposition);
  if (!conditionEvidence || !disposition) return undefined;
  return {
    event: fields.event as AutomationStudioFlowRunLifecycleEvent,
    handlerId: fields.handlerId,
    occurrence: fields.occurrence,
    conditionEvidence,
    disposition,
    completionCheck: fields.completionCheck as AutomationStudioFlowRunFactTruth
  };
}
