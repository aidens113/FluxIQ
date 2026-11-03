import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import type { ActionResult } from "@fluxiq/contracts/runtime";
import type { RecordingIngressGuard } from "./guard.ts";
import { RecordingIngressShapes as S } from "./shape.ts";
import { isRecordingVisualTarget } from "./visual-target.ts";
import { isRecordingStateValue } from "./state/index.ts";
import { isRecordingConfidence } from "../../../runtime/recording/validation/confidence/index.ts";

/** Decodes the shared append union without substituting a trimmed timeline DTO. */
export function decodeRecordingEntry<TTarget, TEvidence>(value: unknown, guards: { target: RecordingIngressGuard<TTarget>; evidence: RecordingIngressGuard<TEvidence> }): AppendRecordingEntryInput<TTarget, TEvidence> {
  type Input = AppendRecordingEntryInput<TTarget, TEvidence>;
  const common = { id: S.optional(S.string), timestamp: S.optional(S.number), monotonicOffsetMs: S.optional(S.number), sourceId: S.optional(S.string), confidence: S.optional(isRecordingConfidence), correlationId: S.optional(S.string), causationId: S.optional(S.string), metadata: S.optional(S.jsonObject) };
  const result = S.object<ActionResult<TEvidence>>({ status: S.oneOf("succeeded", "failed", "timed_out", "cancelled", "unknown"), message: S.optional(S.string), evidence: S.optional(S.array(guards.evidence)), metadata: S.optional(S.jsonObject) });
  const action = S.object<Extract<Input, { type: "action" }>>({ ...common, type: S.oneOf("action"), actionType: S.string, parameters: S.record, origin: S.oneOf("operator", "runtime", "assistant", "external"), startedAt: S.number, completedAt: S.optional(S.number), target: S.optional(guards.target), visualTarget: S.optional(isRecordingVisualTarget), result: S.optional(result), outputId: S.optional(S.string), confirmationInputId: S.optional(S.string), confirmationTimeoutMs: S.optional(S.number) });
  const observation = S.object<Extract<Input, { type: "observation" }>>({ ...common, type: S.oneOf("observation"), observationType: S.string, signals: S.optional(S.dictionary(isRecordingStateValue)), payload: S.optional(S.jsonObject) });
  const domain = S.object<Extract<Input, { type: "domain_event" }>>({ ...common, type: S.oneOf("domain_event"), eventType: S.string, payload: S.optional(S.jsonObject) });
  const marker = S.object<Extract<Input, { type: "marker" }>>({ ...common, type: S.oneOf("marker"), label: S.string });
  if (action(value) || observation(value) || domain(value) || marker(value)) return value;
  throw new Error("recording.invalid_entry");
}
