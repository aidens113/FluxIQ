import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";

/**
 * What a recorded node knows about the state it was taken in.
 *
 * Every node a recording proposal produces carries `stateLink`,
 * `stateSnapshotId`, `stateRef` and `screenshotRef` in its metadata, written by
 * `recordingCandidateStateLinkMetadata`. Until now no execution path read any
 * of them: the recorded state was captured, stored, indexed -- and never
 * consulted while the Flow ran. This is the reader.
 */
export type AutomationStudioRecordedState = {
  /** The recording this node was taken from, when the link names one. */
  recordingId?: string;
  /** The timeline entry the node was mapped from. */
  actionEntryId?: string;
  /** The recorded state snapshot that held when this action was taken: the node's pre-state. */
  stateSnapshotId?: string;
  /** Where that snapshot's contents are stored. */
  stateRef?: string;
  screenshotRef?: string;
  /**
   * How long the recording waited between the step before this node and this
   * one, in milliseconds, preferring the monotonic clock that survives a
   * wall-clock change. It is the node's wait ceiling, never a sleep.
   */
  recordedGapMs?: number;
};

/** The node metadata field carrying the recorded inter-step gap, in milliseconds. */
export const AUTOMATION_STUDIO_RECORDED_GAP_METADATA_KEY = "recordedGapMs";

/** The shortest a recorded gap may hold the run up for; a 50 ms recording must not give up after 50 ms on a slow day. */
export const AUTOMATION_STUDIO_READINESS_FLOOR_MS = 2_000;

/** The longest one; a 90 s gap where the author went to make coffee must not stall a run. */
export const AUTOMATION_STUDIO_READINESS_CAP_MS = 30_000;

/** What the recorded node says about the state it ran in. Absent fields mean the node was not recorded, or was recorded before this was stored. */
export function automationStudioRecordedState(node: AutomationStudioFlowNode): AutomationStudioRecordedState {
  const metadata = node.metadata ?? {};
  const link = plainObject(metadata.stateLink) ?? {};
  const recordingId = text(link.recordingId);
  const actionEntryId = text(link.actionEntryId) ?? text(metadata.actionEntryId);
  const stateSnapshotId = text(metadata.stateSnapshotId) ?? text(link.stateSnapshotId);
  const stateRef = text(metadata.stateRef) ?? text(link.stateRef);
  const screenshotRef = text(metadata.screenshotRef) ?? text(link.screenshotRef);
  const recordedGapMs = nonNegativeNumber(metadata[AUTOMATION_STUDIO_RECORDED_GAP_METADATA_KEY]);
  return {
    ...(recordingId !== undefined ? { recordingId } : {}),
    ...(actionEntryId !== undefined ? { actionEntryId } : {}),
    ...(stateSnapshotId !== undefined ? { stateSnapshotId } : {}),
    ...(stateRef !== undefined ? { stateRef } : {}),
    ...(screenshotRef !== undefined ? { screenshotRef } : {}),
    ...(recordedGapMs !== undefined ? { recordedGapMs } : {})
  };
}

/**
 * How long the run waits for a node's expected state before attempting it
 * anyway: twice the recorded gap, floored at 2 s and capped at 30 s.
 *
 * A recorded delay is a ceiling, not a sleep. The state appearing sooner runs
 * the node sooner, so a replay on a fast page beats the recording that produced
 * it; the deadline passing attempts the node regardless, because the recording
 * is evidence the action was possible at that point.
 */
export function automationStudioReadinessCeilingMs(recordedGapMs: number | undefined): number {
  const doubled = recordedGapMs === undefined ? AUTOMATION_STUDIO_READINESS_FLOOR_MS : recordedGapMs * 2;
  return Math.min(AUTOMATION_STUDIO_READINESS_CAP_MS, Math.max(AUTOMATION_STUDIO_READINESS_FLOOR_MS, Math.round(doubled)));
}

/**
 * The state a node expects to find before it runs, as the host's condition
 * shape, or nothing when the node names none.
 *
 * `readyState` is the authored or recorded pre-state. It is deliberately not
 * `expectedState`, which is what the node is meant to *produce*: waiting for a
 * click's own result before clicking would wait forever, and on a node that is
 * itself a wait it would make the wait redundant.
 */
export function automationStudioNodeReadinessState(node: AutomationStudioFlowNode): JsonObject | undefined {
  const declared = plainObject(node.parameterValues?.readyState) ?? plainObject(node.metadata?.readyState);
  return declared && Object.keys(declared).length ? declared : undefined;
}

/**
 * One expected-state object as the conditions, mode and timeout the host
 * evaluator is called with. `timeoutMs` overrides whatever the object declares,
 * because the caller owns the deadline: a readiness gate spends the wait
 * ceiling, and a re-check after a failure spends what the ladder allows it.
 */
export function automationStudioExpectationRequest(expectedState: JsonObject, timeoutMs?: number): { conditions: JsonValue[]; mode: string; timeoutMs: number } {
  const conditions = Array.isArray(expectedState.conditions) ? expectedState.conditions : [expectedState as JsonValue];
  const mode = typeof expectedState.mode === "string" ? expectedState.mode : "all";
  const declared = typeof expectedState.timeoutMs === "number" ? expectedState.timeoutMs : 0;
  return { conditions, mode, timeoutMs: timeoutMs ?? declared };
}

function plainObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nonNegativeNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

