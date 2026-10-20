import { describe, expect, it } from "vitest";
import { clientGatewayTraceArtifactDigest, evaluateClientGatewayTraceCompleteness } from "../index.ts";
import type { ClientGatewayTraceCompatibility, ClientGatewayTraceCompletenessInput, ClientGatewayTraceEvent, ClientGatewayTraceManifest } from "../index.ts";
import { TRACE_ID, artifactInput, correlation, eventInput, newRecorder, textEvent } from "./trace-builders.ts";

const COMPATIBLE: ClientGatewayTraceCompatibility = { status: "compatible" };

/** A closed four-event trace: an observation, a delta on it, an artifact, and the disposition of the first. */
async function closedTrace(): Promise<ClientGatewayTraceCompletenessInput> {
  const { recorder, store } = newRecorder();
  const first = recorder.record(textEvent('{"type":"client.snapshot"}', { correlation: correlation({ observationRevision: "obs-1" }) }));
  recorder.record(textEvent('{"type":"client.state_update"}', { correlation: correlation({ observationRevision: "obs-2", baseRevision: "obs-1" }) }));
  recorder.recordArtifact(artifactInput(new Uint8Array([1, 2, 3])));
  const firstId = first.status === "recorded" ? first.eventId : "missing";
  recorder.record(eventInput({ encoding: "json", value: { outcome: "accepted" } }, "disposition", { messageType: "accepted", correlation: correlation({ causationEventId: firstId }) }));
  recorder.markCheckpoint({ id: "start", sequence: 1, observationRevision: "obs-1" });
  const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
  return {
    manifest,
    events: await store.readEventRange(TRACE_ID, 1, 4),
    availableArtifacts: await store.listArtifacts(TRACE_ID),
    compatibility: COMPATIBLE,
    recorderActive: false
  };
}

function codes(input: ClientGatewayTraceCompletenessInput): [string, unknown][] {
  return evaluateClientGatewayTraceCompleteness(input).issues.map((issue) => [issue.code, issue.range ?? issue.artifactId]);
}

function withManifest(input: ClientGatewayTraceCompletenessInput, manifest: ClientGatewayTraceManifest): ClientGatewayTraceCompletenessInput {
  return { ...input, manifest };
}

function withEvents(input: ClientGatewayTraceCompletenessInput, events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceCompletenessInput {
  return { ...input, events };
}

describe("evaluateClientGatewayTraceCompleteness", () => {
  it("a closed trace with every event, artifact and correlation present is complete", async () => {
    const input = await closedTrace();
    expect(evaluateClientGatewayTraceCompleteness(input)).toEqual({ status: "complete", issues: [], limitations: [] });
  });

  it("T14: a truncated trace (the tail missing) is incomplete, tagged by the missing range", async () => {
    const input = await closedTrace();
    const result = evaluateClientGatewayTraceCompleteness(withEvents(input, input.events.slice(0, 2)));
    expect(result.status).toBe("incomplete");
    expect(result.issues.map((issue) => [issue.code, issue.range])).toContainEqual(["truncated", { from: 3, to: 4 }]);
  });

  it("T14: a trace that was never closed is truncated unless a recorder is known to be writing it", async () => {
    const { recorder, store } = newRecorder();
    recorder.record(textEvent("{}"));
    await recorder.flush();
    const manifest = (await store.readManifest(TRACE_ID))!;
    const input: ClientGatewayTraceCompletenessInput = { manifest, events: await store.readEventRange(TRACE_ID, 1, 1), availableArtifacts: [], compatibility: COMPATIBLE, recorderActive: false };
    expect(codes(input)).toEqual([["truncated", { from: 2, to: null }]]);
    expect(evaluateClientGatewayTraceCompleteness(input).status).toBe("incomplete");
    expect(evaluateClientGatewayTraceCompleteness({ ...input, recorderActive: true }).status).toBe("open");
  });

  it("T14: a sequence gap in the middle is incomplete, tagged by the gap", async () => {
    const input = await closedTrace();
    const result = evaluateClientGatewayTraceCompleteness(withEvents(input, input.events.filter((event) => event.sequence !== 2)));
    expect(result.status).toBe("incomplete");
    expect(result.issues.map((issue) => [issue.code, issue.range])).toContainEqual(["sequence_gap", { from: 2, to: 2 }]);
  });

  it("T14: a broken delta base is a broken correlation at the delta, never silently filled", async () => {
    const input = await closedTrace();
    const rebased = input.events.map((event) =>
      event.sequence === 2 ? { ...event, correlation: { ...event.correlation, baseRevision: "obs-unknown" } } : event
    );
    expect(codes(withEvents(input, rebased))).toEqual([["broken_correlation", { from: 2, to: 2 }]]);
  });

  it("T14: a removed artifact is missing evidence tagged by the artifact", async () => {
    const input = await closedTrace();
    const artifactId = input.manifest.artifacts[0]!.id;
    const result = evaluateClientGatewayTraceCompleteness({ ...input, availableArtifacts: [] });
    expect(result.status).toBe("incomplete");
    expect(result.issues).toEqual([{ code: "missing_artifact", range: { from: 3, to: 3 }, artifactId, detail: `artifact ${artifactId} is not available` }]);
  });

  it("T14: an artifact whose bytes no longer match the recorded digest is an integrity issue", async () => {
    const input = await closedTrace();
    const tampered = input.availableArtifacts.map((artifact) => ({ ...artifact, sha256: "0".repeat(64) }));
    expect(codes({ ...input, availableArtifacts: tampered })).toEqual([["artifact_integrity", { from: 3, to: 3 }]]);
  });

  it("T14: an incompatible contract makes the whole trace incomplete", async () => {
    const input = await closedTrace();
    const result = evaluateClientGatewayTraceCompleteness({
      ...input,
      compatibility: { status: "incompatible", contracts: [{ name: "protocol", recordedVersion: "1", detail: "this runtime reads protocol 2" }] }
    });
    expect(result.status).toBe("incomplete");
    expect(result.issues).toEqual([{ code: "incompatible_contract", range: null, artifactId: null, detail: "protocol@1: this runtime reads protocol 2" }]);
    expect(codes(withManifest(input, { ...input.manifest, traceSchemaVersion: 99 }))).toEqual([["incompatible_contract", null]]);
  });

  it("T14: missing evidence never evaluates complete, even when the recorder claims complete", async () => {
    const input = await closedTrace();
    const claimsComplete = withManifest(input, { ...input.manifest, completeness: { ...input.manifest.completeness, status: "complete" } });
    expect(evaluateClientGatewayTraceCompleteness({ ...claimsComplete, events: [] }).status).toBe("incomplete");
    const claimsIncomplete = withManifest(input, { ...input.manifest, completeness: { ...input.manifest.completeness, status: "incomplete" } });
    expect(codes(claimsIncomplete)).toEqual([["declared_incomplete", null]]);
  });

  it("flags a disposition without its inbound cause, a cause delivered later, and a foreign or duplicated event", async () => {
    const input = await closedTrace();
    const disposition = input.events[3]!;
    const orphaned = { ...disposition, correlation: { ...disposition.correlation, causationEventId: null } };
    expect(codes(withEvents(input, [...input.events.slice(0, 3), orphaned]))).toEqual([["broken_correlation", { from: 4, to: 4 }]]);
    const foreign = { ...input.events[0]!, traceId: "other-trace" };
    const duplicate = { ...input.events[1]!, eventId: "dup" };
    const result = codes(withEvents(input, [...input.events, foreign, duplicate]));
    expect(result).toEqual([
      ["foreign_event", { from: 1, to: 1 }],
      ["sequence_conflict", { from: 2, to: 2 }]
    ]);
  });

  it("an event in an undeclared stream, or a checkpoint without its event, is incomplete", async () => {
    const input = await closedTrace();
    const stray = input.events.map((event) => (event.sequence === 1 ? { ...event, stream: "elsewhere" } : event));
    expect(codes(withEvents(input, stray))).toEqual([["undeclared_stream", { from: 1, to: 1 }]]);
    const checkpoints = [{ id: "late", sequence: 9, observationRevision: null }];
    expect(codes(withManifest(input, { ...input.manifest, checkpoints }))).toContainEqual(["broken_correlation", { from: 9, to: 9 }]);
  });

  it("a redaction is a fidelity limitation of its scope and leaves a whole capture complete", async () => {
    const { recorder, store } = newRecorder();
    recorder.record(textEvent('{"type":"client.hello","token":{"redacted":"credential"}}', { redactions: [{ path: "/token", reason: "credential" }] }));
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const result = evaluateClientGatewayTraceCompleteness({ manifest, events: await store.readEventRange(TRACE_ID, 1, 1), availableArtifacts: [], compatibility: COMPATIBLE, recorderActive: false });
    expect(result).toEqual({ status: "complete", issues: [], limitations: [{ code: "redaction_limited", range: { from: 1, to: 1 }, path: "/token", reason: "credential" }] });
  });

  describe("an artifact referenced by digest", () => {
    const BYTES = new Uint8Array([7, 8, 9]);
    const HELD = clientGatewayTraceArtifactDigest(BYTES);

    /** A closed trace of a result referencing `digest` and an artifact upload of BYTES, in the given order. */
    async function referencing(digest: string, order: "artifact_first" | "result_first"): Promise<ClientGatewayTraceCompletenessInput> {
      const { recorder, store } = newRecorder();
      if (order === "artifact_first") recorder.recordArtifact(artifactInput(BYTES));
      recorder.record(textEvent('{"type":"client.action_result"}', { referencedDigests: [digest] }));
      if (order === "result_first") recorder.recordArtifact(artifactInput(BYTES));
      const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
      return {
        manifest,
        events: await store.readEventRange(TRACE_ID, 1, 2),
        availableArtifacts: await store.listArtifacts(TRACE_ID),
        compatibility: COMPATIBLE,
        recorderActive: false
      };
    }

    it("delivered into the trace before the reference is complete", async () => {
      const input = await referencing(HELD, "artifact_first");
      expect(evaluateClientGatewayTraceCompleteness(input)).toEqual({ status: "complete", issues: [], limitations: [] });
    });

    it("never delivered into the trace is missing evidence at the referencing event", async () => {
      const absent = "b".repeat(64);
      const input = await referencing(absent, "artifact_first");
      const result = evaluateClientGatewayTraceCompleteness(input);
      expect(result.status).toBe("incomplete");
      expect(result.issues).toEqual([expect.objectContaining({ code: "missing_artifact", range: { from: 2, to: 2 }, artifactId: null })]);
      expect(result.issues[0]?.detail).toContain(absent);
    });

    it("delivered only after the reference is a broken correlation at the referencing event", async () => {
      const input = await referencing(HELD, "result_first");
      const artifactId = input.manifest.artifacts[0]!.id;
      expect(evaluateClientGatewayTraceCompleteness(input).issues).toEqual([expect.objectContaining({ code: "broken_correlation", range: { from: 1, to: 1 }, artifactId })]);
    });

    it("whose bytes the store no longer holds is still missing evidence", async () => {
      const input = await referencing(HELD, "artifact_first");
      const result = evaluateClientGatewayTraceCompleteness({ ...input, availableArtifacts: [] });
      expect(result.status).toBe("incomplete");
      expect(result.issues.map((issue) => issue.code)).toContain("missing_artifact");
    });
  });
});
