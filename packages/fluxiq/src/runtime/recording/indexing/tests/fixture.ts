import type { RecordingIndex } from "@fluxiq/contracts/recording";
import { emptyRecordingIndex } from "../index.ts";
import type { RecordingIndexBuildPorts, RecordingIndexObservationPolicy, RecordingReferenceReader } from "../index.ts";

export const projectId = "project.one";
export const recordingId = "recording.one";
export const ref = (name: string, project = projectId) => `asset:${project}:${name}`;

export const references: RecordingReferenceReader = {
  accepts: (reference, scope) => reference.startsWith(`asset:${scope.projectId}:`),
  validate(reference, scope) {
    if (!reference.startsWith("asset:")) return { ok: false, code: "invalid_object_ref", message: `Invalid asset ${reference}` };
    if (!reference.startsWith(`asset:${scope.projectId}:`)) return { ok: false, code: "cross_project_ref", message: `Foreign asset ${reference}` };
    return { ok: true };
  }
};

export const observations: RecordingIndexObservationPolicy = { isSnapshot: (entry) => entry.observationType === "machine.capture", embeddedState: () => undefined };
export const ports: RecordingIndexBuildPorts = { references, observations, now: () => 500 };

export function fixtureIndex(): RecordingIndex {
  const index = emptyRecordingIndex({ projectId, recordingId, startedAt: 1, updatedAt: 20 });
  index.entries["entry.state.one"] = { entryId: "entry.state.one", type: "observation", timestamp: 10, sequence: 0, stateSnapshotId: "state.one" };
  index.entries["entry.action"] = { entryId: "entry.action", type: "action", timestamp: 11, sequence: 1, actionId: "action.one", stateSnapshotId: "state.one" };
  index.entries["entry.state.two"] = { entryId: "entry.state.two", type: "observation", timestamp: 12, sequence: 2, stateSnapshotId: "state.two" };
  index.actions["action.one"] = { actionId: "action.one", entryId: "entry.action", actionType: "mark", startedAt: 11, stateAtActionId: "state.one" };
  index.states["state.one"] = { stateSnapshotId: "state.one", entryId: "entry.state.one", timestamp: 10, stateRef: ref("one"), objectRefs: [ref("one")], linkedActionIds: [] };
  index.states["state.two"] = { stateSnapshotId: "state.two", entryId: "entry.state.two", timestamp: 12, stateRef: ref("two"), objectRefs: [ref("two")], linkedActionIds: [] };
  return index;
}
