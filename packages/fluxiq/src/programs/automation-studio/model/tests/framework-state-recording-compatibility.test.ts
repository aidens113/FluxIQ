import { expect, expectTypeOf, it } from "vitest";
import type { ActionResult as SharedResult, RecordingDomainDefinition as SharedDomain, RecordingSession as SharedSession } from "@fluxiq/contracts/automation-studio";
import type { ActionResult, ActionTarget } from "../actions.ts";
import type { RecordingSession } from "../recordings.ts";
import type { RecordingDomainDefinition } from "../recording-domain.ts";
import type { EvidenceReference } from "../evidence.ts";
import type { SignalDefinition } from "../signals.ts";
import { createRecordingSession, appendRecordingEntry } from "../recording-framework.ts";
import { validateStateSnapshot, validateRecordingSession } from "../validation/index.ts";
import { normalizeRecordingTimeline } from "../../normalization/index.ts";

it("retains broad shared evidence/signals and rich Core specializations", () => {
  expectTypeOf<ActionResult["evidence"]>().toEqualTypeOf<EvidenceReference[] | undefined>();
  expectTypeOf<RecordingDomainDefinition["signals"]>().toEqualTypeOf<SignalDefinition[] | undefined>();
  const sharedResult: SharedResult = { status: "succeeded", evidence: [{ opaque: { count: 2 } }] };
  const sharedDomain: SharedDomain = { domainId: "opaque", label: "Opaque", schemaVersion: "1", events: [], signals: [{ opaque: { score: 1 } }] };
  const target: ActionTarget = { type: "legacy", selector: "#saved", elementTarget: { kind: "element", fingerprint: { xpath: "/saved", tagName: "button" } } };
  let recording: RecordingSession = createRecordingSession({ recordingId: "rich", description: "Preserved", startedAt: 1, initialState: { id: "snapshot", timestamp: 1, namespaces: { machine: { schemaId: "machine", schemaVersion: "1", values: { value: { type: "json", value: { opaque: true }, observedAt: 1, presentation: { label: "Value" } } } } }, presentation: { defaultFrameId: "frame", visualFrames: [{ id: "frame", coordinateSpace: { width: 1, height: 1, unit: "cell" }, layers: [{ id: "image", kind: "image", contentRef: "object://image", bounds: { x: 0, y: 0, width: 1, height: 1 } }] }] } } });
  recording = appendRecordingEntry(recording, { type: "action", outputId: "run", confirmationInputId: "done", confirmationTimeoutMs: 7, actionType: "run", parameters: {}, target, origin: "operator", startedAt: 2, timestamp: 2 });
  const restored: SharedSession = JSON.parse(JSON.stringify(recording));
  expect(restored).toEqual(recording);
  expect(restored.description).toBe("Preserved");
  expect(restored.initialState.presentation?.defaultFrameId).toBe("frame");
  expect(sharedResult.evidence).toEqual([{ opaque: { count: 2 } }]);
  expect(sharedDomain.signals).toEqual([{ opaque: { score: 1 } }]);
  expect(validateStateSnapshot(recording.initialState).issues).toEqual([]);
  expect(validateRecordingSession(recording).ok).toBe(true);
  const nullTarget = JSON.parse(JSON.stringify(recording));
  nullTarget.timeline[0].target = null;
  expect(validateRecordingSession(nullTarget).ok).toBe(true);
});

it("binds the exact old reference allowlist and normalizer state-payload policy", () => {
  const snapshot = { timestamp: 1, namespaces: {}, presentation: { visualFrames: [{ id: "f", coordinateSpace: { width: 1, height: 1, unit: "px" as const }, layers: [{ id: "i", kind: "image" as const, contentRef: "https://invalid.test/image", bounds: { x: 0, y: 0, width: 1, height: 1 } }] }] } };
  expect(validateStateSnapshot(snapshot).issues[0]?.message).toBe("Image layer contentRef must be an Automation Studio object or API reference.");
  let recording = createRecordingSession({ recordingId: "legacy-policy", startedAt: 0, initialState: { timestamp: 0, namespaces: {} } });
  for (const timestamp of [1, 2, 3, 4]) recording = appendRecordingEntry(recording, { type: "observation", observationType: "opaque", timestamp, payload: { state: "old-compatible" } });
  expect(normalizeRecordingTimeline(recording).timeline.map(entry => entry.timestamp)).toEqual([1, 4]);
});
