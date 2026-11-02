import { expect, it, vi } from "vitest";
import type { ActionEntry } from "@fluxiq/contracts/recording";
import type { AutomationStudioRecordingMapperBinding } from "../../../../components/automation/importer/recording-mapper/index.ts";
import { createElementMatcher } from "../../../target-matching/index.ts";
import { runRecordingMapper } from "../run.ts";
import { recordingMapperCalls } from "../calls/index.ts";
import { recordingCandidateGapTracker } from "../gap.ts";
import { recordingTimelineForProposalMapping } from "../timeline.ts";
import { io, mapper, observation } from "./fixtures.ts";

const input = (bound: AutomationStudioRecordingMapperBinding, timeline = [observation("entry.first"), observation("entry.second", 700)]) => ({
  mapper: bound, io, elementMatcher: createElementMatcher(), recordingId: "recording.actual", domainId: "domain.actual",
  timeline, rawEntryCount: timeline.length, entryCounts: `${timeline.length} observations`, nextCandidateId: (id: string) => `candidate.${id}`, formatTokenLabel: (id: string) => `Label ${id}`
});

it("keeps the original mapper/normalizer/lookup receivers and actual port arguments", async () => {
  const nextCandidateId = vi.fn((id: string) => `allocated.${id}`);
  const bound = mapper(function (this: AutomationStudioRecordingMapperBinding, observed, context) {
    expect(this).toBe(bound);
    expect(context.elementMatcher).toBe(args.elementMatcher);
    return { outputId: "action.send", parameters: { original: observed.observationId } };
  });
  bound.normalizeParameters = function (this: AutomationStudioRecordingMapperBinding, domainId, parameters, context) {
    expect(this).toBe(bound);
    expect(domainId).toBe("domain.actual");
    expect(context).toEqual({ outputId: "action.send", sourceEntryId: "entry.first", source: "mapper" });
    return { ...parameters, normalized: true };
  };
  const lookup = {
    resolveCandidateActionEntryId(source: string) {
      expect(this).toBe(lookup);
      return `${source}.action`;
    },
    proposalNodeStateLink(action: string) {
      expect(this).toBe(lookup);
      return { recordingId: "recording.actual", actionEntryId: action, stateSnapshotId: "state.actual", stateRef: "states/actual.json" };
    }
  };
  const args = { ...input(bound, [observation("entry.first")]), nextCandidateId, lookup };
  const result = await runRecordingMapper(args);
  expect(result.issues).toEqual([]);
  expect(nextCandidateId.mock.calls).toEqual([["entry.first.action"]]);
  expect(result.candidates[0]).toMatchObject({ candidateId: "allocated.entry.first.action", parameters: { original: "entry.first", normalized: true }, stateLink: { stateSnapshotId: "state.actual" } });
});

it("advances gaps before rejected candidates, stops that entry, and continues later entries", async () => {
  const bound = mapper((entry) => entry.observationId === "entry.first"
    ? { candidates: [{ outputId: "action.send" }, { outputId: "action.send", timeoutMs: 0 }, { outputId: "action.send", label: "unreached" }] }
    : { outputId: "action.send" });
  const args = input(bound, [observation("entry.first", 100), observation("entry.second", 700.6)]);
  const result = await runRecordingMapper(args);
  expect(result.stats).toEqual({ mappedEntryCount: 2, emittedCandidateCount: 4, acceptedCandidateCount: 2 });
  expect(result.candidates.map((candidate) => candidate.recordedGapMs)).toEqual([undefined, 601]);
  expect(result.candidates.map((candidate) => candidate.label)).toEqual([undefined, undefined]);
  expect(result.issues).toEqual(["Mapper mapper.actual could not map entry entry.first: Recording mapper candidate for action.send has an invalid timeoutMs: it must be a whole number of milliseconds above zero."]);
});

it("does not allocate candidate IDs for invalid candidates and never leaks callback causes", async () => {
  const nextCandidateId = vi.fn(() => "unreached");
  const bound = mapper((entry) => {
    if (entry.observationId === "entry.first") throw new Error("PRIVATE PAGE VALUE");
    return { outputId: "not.declared" };
  });
  const result = await runRecordingMapper({ ...input(bound), nextCandidateId, rawEntryCount: 4, entryCounts: "4 observations" });
  expect(nextCandidateId).not.toHaveBeenCalled();
  expect(result.candidates).toEqual([]);
  expect(result.issues).toEqual([
    "Mapper mapper.actual could not map entry entry.first: Unknown mapper error.",
    "Mapper mapper.actual could not map entry entry.second: Recording mapper emitted undeclared output not.declared.",
    "Mapper mapper.actual emitted no valid action candidates for recording recording.actual. It saw 2 proposal entries from 4 raw entries (4 observations), matched 1, emitted 1 raw candidates, and accepted 0 valid candidates."
  ]);
});

it("bounds invalid mapper/entry identities and does not trust Error prototypes or throwing message getters", async () => {
  const failure = Object.create(Error.prototype);
  Object.defineProperty(failure, "message", { get() { throw new Error("PRIVATE GETTER"); } });
  const bound = mapper(() => { throw failure; });
  bound.definition.id = "PRIVATE\nPAGE";
  const result = await runRecordingMapper(input(bound, [observation("x".repeat(200))]));
  expect(result.issues[0]).toBe("Mapper [unavailable] could not map entry [unavailable]: Unknown mapper error.");
  expect(JSON.stringify(result.issues)).not.toMatch(/PRIVATE|GETTER|x{200}/);
});

it("uses the real action fallback only when the mapper emits nothing", async () => {
  const entry: ActionEntry = { ...observation("entry.action", 300), type: "action", actionType: "ignored", outputId: " action.send ", parameters: { raw: true }, confirmationInputId: "input.done", metadata: { inputId: " input.actual " }, origin: "operator", startedAt: 400 };
  const result = await runRecordingMapper({ ...input(mapper(() => null)), timeline: [entry], rawEntryCount: 1 });
  expect(result.stats).toEqual({ mappedEntryCount: 1, emittedCandidateCount: 1, acceptedCandidateCount: 1 });
  expect(result.candidates[0]).toMatchObject({ outputId: "action.send", parameters: { raw: true }, sourceInputIds: ["input.actual"], expectedConfirmation: { inputId: "input.done", timeoutMs: 5000 }, label: "Label action.send", confidence: 0.95 });
  const ineligible = await runRecordingMapper({ ...input(mapper(() => null)), timeline: [{ ...entry, metadata: { policyEligible: false } }], rawEntryCount: 1 });
  expect(ineligible.candidates).toEqual([]);
  expect(ineligible.stats.emittedCandidateCount).toBe(0);
});

it("builds fresh mapper calls, shares following references within a mapper, and limits after filtering", () => {
  const timeline = Array.from({ length: 40 }, (_, index) => observation(`entry.${index}`, index, index % 3 ? "action.observed" : "transport.state"));
  const filtered = recordingTimelineForProposalMapping(timeline, { isStateObservation: (entry) => entry.observationType === "transport.state" });
  const first = recordingMapperCalls(filtered, "recording.actual", "domain.actual"), second = recordingMapperCalls(filtered, "recording.actual", "domain.actual");
  expect(first[0]!.following).toHaveLength(filtered.length - 1);
  expect(first[0]!.following[0]).toBe(first[1]!.observation);
  expect(first[0]!.following[0]).not.toBe(second[1]!.observation);
  expect(recordingMapperCalls(timeline, "recording.actual", "domain.actual")[0]!.following).toHaveLength(32);
  first[1]!.observation.payload.changed = true;
  expect(second[1]!.observation.payload).not.toHaveProperty("changed");
  expect(filtered[1]!.payload).not.toHaveProperty("changed");
  expect(Object.keys(first[0]!.observation.payload)).not.toContain("sourceId");
});

it("measures first/same/backward/nonfinite gaps without inventing waits", () => {
  const gap = recordingCandidateGapTracker();
  expect([10, 10, 6, Number.NaN, 20, Number.POSITIVE_INFINITY, 30].map((monotonicOffsetMs) => gap({ monotonicOffsetMs }))).toEqual([undefined, 0, undefined, undefined, 14, undefined, 10]);
});
