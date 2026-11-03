import { expect, it } from "vitest";
import type { RecordingSession } from "../../recordings.ts";
import type { RecordingTargetValidationPolicy } from "../../../../../runtime/recording/validation/index.ts";
import { validateRecordingSession } from "../recording.ts";

function recording(): RecordingSession {
  return {
    schemaVersion: "0.1",
    recordingId: "recording.opaque",
    startedAt: 1,
    environment: { id: "environment.opaque", label: "Opaque", kind: "test", domainId: "untrusted-wire-domain" },
    sources: [{ id: "source.opaque", kind: "event", label: "Opaque" }],
    actionChannels: [],
    initialState: { timestamp: 1, namespaces: {} },
    timeline: [{ id: "entry.opaque", recordingId: "recording.opaque", sequence: 0, sourceId: "source.opaque", timestamp: 2, monotonicOffsetMs: 1, type: "action", actionType: "opaque", parameters: { target: { original: { opaque: true } } }, target: { type: "machine", metadata: { opaque: [1, 2] } }, origin: "operator", startedAt: 2 }],
    notes: [],
    metadata: {}
  };
}

it("uses structural validation without inspecting opaque targets or selecting code from the recording domain", () => {
  const value = recording();
  const action = value.timeline[0]!;
  if (action.type !== "action") throw new Error("Expected original action fixture.");
  let reads = 0;
  Object.defineProperty(action.target, "elementTarget", { get() {
    reads++;
    throw new Error("Domain interpretation was not supplied.");
  } });
  Object.defineProperty(value.environment, "domainId", { get() {
    reads++;
    throw new Error("Wire data cannot select code.");
  } });
  expect(validateRecordingSession(value)).toEqual({ ok: true, issues: [] });
  expect(reads).toBe(0);
});

it("preserves generic confidence and recording time refusals without a target policy", () => {
  const value = recording();
  value.endedAt = 0;
  value.timeline[0]!.confidence = 2;
  expect(validateRecordingSession(value).issues.map(issue => issue.code)).toEqual(["recording.ends_before_start", "timeline.invalid_confidence"]);
});

it("delegates an explicit policy with its original receiver and complete original arguments", () => {
  const value = recording();
  const action = value.timeline[0]!;
  if (action.type !== "action") throw new Error("Expected original action fixture.");
  const warning = { severity: "warning" as const, code: "domain.target_warning", message: "Original target warning", path: "timeline.0.target" };
  const failure = { severity: "error" as const, code: "domain.parameters_error", message: "Original parameter refusal", path: "timeline.0.parameters" };
  const policy: RecordingTargetValidationPolicy<unknown> = {
    targetIssues(this: unknown, target, path) {
      expect(this).toBe(policy);
      expect(target).toBe(action.target);
      expect(path).toBe(warning.path);
      return [warning];
    },
    parameterIssues(this: unknown, parameters, path) {
      expect(this).toBe(policy);
      expect(parameters).toBe(action.parameters);
      expect(path).toBe(failure.path);
      return [failure];
    }
  };
  const result = validateRecordingSession(value, policy);
  expect(result).toEqual({ ok: false, issues: [warning, failure] });
  expect(result.issues[0]).toBe(warning);
  expect(result.issues[1]).toBe(failure);
});

it("preserves the original explicitly supplied policy error", () => {
  const failure = new Error("Original policy failure");
  const policy: RecordingTargetValidationPolicy<unknown> = { targetIssues: () => { throw failure; }, parameterIssues: () => [] };
  let observed: unknown;
  try { validateRecordingSession(recording(), policy); }
  catch (error) { observed = error; }
  expect(observed).toBe(failure);
});
