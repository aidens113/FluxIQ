import { afterEach, expect, it, vi } from "vitest";
import { buildRecordingStateIndex, missingRecordingStateLookup as legacyMissing, proposalNodeStateLinkFromIndex as legacyLink, resolveCandidateActionEntryId as legacyCandidateSource, resolveRecordingStateIndexItem as legacyResolve, recordingEntryIndexedTimestamp, recordingEntryIsStateSnapshot } from "../index.ts";
import { buildRecordingStateIndex as canonical, missingRecordingStateLookup, proposalNodeStateLinkFromIndex, resolveCandidateActionEntryId, resolveRecordingStateIndexItem } from "../../../../../../runtime/recording/indexing/index.ts";
import { automationStudioRecordingIndexBuildPorts } from "../policy.ts";
import { expectedProjection, projectId, projectionRecording } from "./projection.ts";

afterEach(() => vi.restoreAllMocks());

it("preserves the complete legacy index projection and leaves its input unchanged", () => {
  vi.spyOn(Date, "now").mockReturnValue(500);
  const recording = projectionRecording();
  const before = structuredClone(recording);
  const actual = buildRecordingStateIndex(projectId, recording);
  expect(actual).toStrictEqual(expectedProjection());
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expectedProjection()));
  expect(actual).toStrictEqual(canonical(projectId, recording, automationStudioRecordingIndexBuildPorts));
  expect(recording).toStrictEqual(before);
});

it("preserves the complete legacy lookup and proposal-link entry points", () => {
  const index = expectedProjection();
  const input = { projectId, recordingId: index.recordingId, entryId: "entry.action" };
  expect(legacyResolve(index, input)).toStrictEqual(resolveRecordingStateIndexItem(index, input));
  expect(legacyLink(index, input.entryId)).toStrictEqual(proposalNodeStateLinkFromIndex(index, input.entryId));
  expect(legacyMissing(input, "absent")).toStrictEqual(missingRecordingStateLookup(input, "absent"));
  const source = { sourceObservationIds: ["entry.action"] };
  expect(legacyCandidateSource(index, "entry.note", source)).toBe(resolveCandidateActionEntryId(index, "entry.note", source));
});

it("binds exactly the legacy snapshot name and shallow embedded-state timestamp policy", () => {
  const entry = projectionRecording().timeline[0]!;
  expect(recordingEntryIsStateSnapshot(entry)).toBe(true);
  if (entry.type !== "observation") throw new Error("Fixture must start with an observation.");
  entry.observationType = "machine.capture";
  expect(recordingEntryIsStateSnapshot(entry)).toBe(false);
  entry.metadata = {};
  entry.payload = { state: { timestamp: 77, namespaces: {} } };
  expect(recordingEntryIndexedTimestamp(entry)).toBe(77);
  entry.payload = { state: { timestamp: 77, namespaces: [] } };
  expect(recordingEntryIndexedTimestamp(entry)).toBe(200);
});
