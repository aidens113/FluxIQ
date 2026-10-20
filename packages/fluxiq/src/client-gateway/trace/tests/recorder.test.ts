import { describe, expect, it } from "vitest";
import { evaluateClientGatewayTraceCompleteness } from "../index.ts";
import type { ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../index.ts";
import { TRACE_ID, artifactInput, correlation, eventInput, failingWriter, newRecorder, textEvent } from "./trace-builders.ts";

async function evaluateStored(store: ClientGatewayTraceStore, manifest: ClientGatewayTraceManifest) {
  return evaluateClientGatewayTraceCompleteness({
    manifest,
    events: await store.readEventRange(TRACE_ID, 1, manifest.completeness.lastSequence),
    availableArtifacts: await store.listArtifacts(TRACE_ID),
    compatibility: { status: "compatible" },
    recorderActive: false
  });
}

describe("ClientGatewayTraceRecorder", () => {
  it("T01: raw inbound text survives byte for byte -- absent vs null, number spellings, unknown fields, key order, empties", async () => {
    const { recorder, store } = newRecorder();
    const raw =
      '{"type":"client.state_update","id":"m-1","payload":{"zeta":1.0,"alpha":null,"n":1e3,"big":12345678901234567890,' +
      '"nested":{"list":[],"map":{},"text":""},"x-extension":{"kept":true}}}';
    const result = recorder.record(textEvent(raw));
    expect(result.status).toBe("recorded");
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const [event] = await store.readEventRange(TRACE_ID, 1, 1);
    expect(event?.payload).toEqual({ encoding: "text", text: raw });
    expect(event?.payload.encoding === "text" && event.payload.text).toBe(raw);
    expect((await evaluateStored(store, manifest)).status).toBe("complete");
  });

  it("T01: a structured outbound copy keeps nested fields, extension fields, empties and explicit null, and omits only undefined", async () => {
    const { recorder, store } = newRecorder();
    const message = { type: "server.execute_action", payload: { args: { list: [], map: {}, text: "", none: null, skipped: undefined }, "x-extra": [1, "two"] } };
    recorder.record(eventInput({ encoding: "json", value: message }, "outbound"));
    await recorder.flush();
    const [event] = await store.readEventRange(TRACE_ID, 1, 1);
    const expected = { type: "server.execute_action", payload: { args: { list: [], map: {}, text: "", none: null }, "x-extra": [1, "two"] } };
    expect(event?.payload).toEqual({ encoding: "json", value: expected });
    const value = event?.payload.encoding === "json" ? event.payload.value : null;
    expect(Object.keys((value as { payload: { args: object } }).payload.args)).toEqual(["list", "map", "text", "none"]);
  });

  it("T04: mutating the live payload, owner or artifact bytes after record leaves the trace unchanged", async () => {
    const { recorder, store } = newRecorder();
    const message = { type: "server.execute_action", payload: { items: [{ name: "a" }] } };
    const owner = { runId: "run-live-1", attempt: 1 };
    recorder.record(eventInput({ encoding: "json", value: message }, "outbound", { correlation: correlation({ commandId: "cmd-1", owner }) }));
    const bytes = new Uint8Array([1, 2, 3]);
    recorder.recordArtifact(artifactInput(bytes));
    message.payload.items[0]!.name = "mutated";
    message.payload.items.push({ name: "added" });
    owner.attempt = 99;
    bytes[0] = 255;
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const [event] = await store.readEventRange(TRACE_ID, 1, 1);
    expect(event?.payload).toEqual({ encoding: "json", value: { type: "server.execute_action", payload: { items: [{ name: "a" }] } } });
    expect(event?.correlation.owner).toEqual({ runId: "run-live-1", attempt: 1 });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event?.payload.encoding === "json" ? event.payload.value : null)).toBe(true);
    const artifactId = manifest.artifacts[0]!.id;
    const stored = await store.readArtifact(TRACE_ID, artifactId);
    expect([...stored!]).toEqual([1, 2, 3]);
    stored![1] = 200;
    expect([...(await store.readArtifact(TRACE_ID, artifactId))!]).toEqual([1, 2, 3]);
    expect((await evaluateStored(store, manifest)).status).toBe("complete");
  });

  it("repeated events: identical inputs are separate deliveries with distinct ids and sequences", async () => {
    const { recorder, store } = newRecorder();
    const first = recorder.record(textEvent('{"type":"client.snapshot"}'));
    const second = recorder.record(textEvent('{"type":"client.snapshot"}'));
    expect(first.status === "recorded" && second.status === "recorded").toBe(true);
    if (first.status !== "recorded" || second.status !== "recorded") return;
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(first.eventId).not.toBe(second.eventId);
    await recorder.flush();
    expect((await store.readEventRange(TRACE_ID, 1, 2)).map((event) => event.eventId)).toEqual([first.eventId, second.eventId]);
  });

  it("assigns one contiguous delivery sequence across streams and kinds, with logical time from the clock origin", async () => {
    const { recorder, store } = newRecorder();
    recorder.record(textEvent("{}"));
    recorder.record(eventInput({ encoding: "none" }, "lifecycle", { stream: "control", messageType: "connect", payloadSchema: null }));
    recorder.recordArtifact(artifactInput(new Uint8Array([9])));
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const events = await store.readEventRange(TRACE_ID, 1, 3);
    expect(events.map((event) => [event.sequence, event.stream, event.kind])).toEqual([
      [1, "gateway", "inbound"],
      [2, "control", "lifecycle"],
      [3, "artifact", "artifact"]
    ]);
    expect(events.map((event) => event.time.logicalMs)).toEqual([10, 20, 30]);
    expect(events[0]?.provenance).toEqual({ episodeId: "run-live-1", origin: "live" });
    expect(manifest.artifacts[0]).toMatchObject({ sequence: 3, byteLength: 1, mediaType: "image/png" });
    expect(events[2]?.artifactIds).toEqual([manifest.artifacts[0]?.id]);
  });

  it("append after close is refused and the closed trace is unchanged", async () => {
    const { recorder, store } = newRecorder();
    recorder.record(textEvent("{}"));
    const manifest = await recorder.close({ terminationReason: "disconnected", terminationDetail: "socket closed" });
    expect(recorder.record(textEvent("{}"))).toEqual({ status: "refused", reason: "closed" });
    expect(recorder.recordArtifact(artifactInput(new Uint8Array([1])))).toEqual({ status: "refused", reason: "closed" });
    expect(recorder.markCheckpoint({ id: "c", sequence: 1, observationRevision: null })).toEqual({ status: "refused", reason: "closed" });
    await expect(recorder.close({ terminationReason: "completed", terminationDetail: null })).rejects.toThrow(/already closed/);
    expect(manifest.terminationReason).toBe("disconnected");
    expect(recorder.status().state).toBe("closed");
    expect(await store.readEventRange(TRACE_ID, 1, 10)).toHaveLength(1);
    expect((await store.readManifest(TRACE_ID))?.completeness.lastSequence).toBe(1);
  });

  it("recorder failure: a store write failure marks the trace incomplete at once and declares every later sequence lost", async () => {
    const { store } = newRecorder();
    const { recorder } = newRecorder({ store: failingWriter(store, 2) });
    recorder.record(textEvent('{"n":1}'));
    await recorder.flush();
    recorder.record(textEvent('{"n":2}'));
    await recorder.flush();
    expect(recorder.status()).toMatchObject({ state: "failed", completeness: "incomplete", failure: { message: "the store failed: disk full", sequence: 2 } });
    const after = recorder.record(textEvent('{"n":3}'));
    expect(after).toMatchObject({ status: "lost", sequence: 3, reason: "recorder_failure" });
    await expect(recorder.close({ terminationReason: "completed", terminationDetail: null })).rejects.toThrow(/disk full/);
    const stored = await store.readManifest(TRACE_ID);
    expect(stored?.closedAt).toBeNull();
    const verdict = await evaluateStored(store, stored!);
    expect(verdict.status).toBe("incomplete");
    expect(verdict.issues.map((issue) => issue.code)).toContain("truncated");
  });

  it("recorder failure: a close that persists declares the lost range and evaluates incomplete", async () => {
    const { store } = newRecorder();
    let failNext = false;
    const flaky = {
      writeArtifact: store.writeArtifact.bind(store),
      writeManifest: store.writeManifest.bind(store),
      async appendEvents(traceId: string, events: Parameters<typeof store.appendEvents>[1]) {
        if (failNext) throw new Error("write timed out");
        await store.appendEvents(traceId, events);
      }
    };
    const { recorder } = newRecorder({ store: flaky });
    recorder.record(textEvent('{"n":1}'));
    await recorder.flush();
    failNext = true;
    recorder.record(textEvent('{"n":2}'));
    await recorder.flush();
    recorder.record(textEvent('{"n":3}'));
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(manifest.completeness.status).toBe("incomplete");
    expect(manifest.completeness.losses).toEqual([{ reason: "recorder_failure", range: { from: 2, to: 3 }, detail: "the store failed: write timed out" }]);
    const verdict = await evaluateStored(store, manifest);
    expect(verdict.status).toBe("incomplete");
    expect(verdict.issues).toEqual([{ code: "recorder_failure", range: { from: 2, to: 3 }, artifactId: null, detail: "the store failed: write timed out" }]);
  });

  it("recorder failure: a payload that cannot be copied takes its sequence, is declared lost, and never throws into the gateway", async () => {
    const { recorder, store } = newRecorder();
    const cyclic: Record<string, unknown> = { type: "server.execute_action" };
    cyclic.self = cyclic;
    const lost = recorder.record(eventInput({ encoding: "json", value: cyclic }, "outbound"));
    expect(lost).toMatchObject({ status: "lost", sequence: 1, reason: "recorder_failure" });
    expect(recorder.record(eventInput({ encoding: "json", value: { when: new Date(0) } }, "outbound"))).toMatchObject({ status: "lost", sequence: 2 });
    expect(recorder.record(textEvent("{}", { stream: "undeclared" }))).toMatchObject({ status: "lost", sequence: 3 });
    expect(recorder.record(textEvent("{}"))).toMatchObject({ status: "recorded", sequence: 4 });
    expect(recorder.status()).toMatchObject({ state: "recording", completeness: "incomplete" });
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(manifest.completeness.losses.map((loss) => loss.range)).toEqual([{ from: 1, to: 3 }]);
    expect((await evaluateStored(store, manifest)).issues.map((issue) => [issue.code, issue.range])).toEqual([["recorder_failure", { from: 1, to: 3 }]]);
  });

  it("overflow: a full buffer declares the event lost, never drops it silently, and recording resumes after a flush", async () => {
    const { recorder, store } = newRecorder({ maxBufferedEvents: 2 });
    recorder.record(textEvent('{"n":1}'));
    recorder.record(textEvent('{"n":2}'));
    expect(recorder.record(textEvent('{"n":3}'))).toMatchObject({ status: "lost", sequence: 3, reason: "buffer_overflow" });
    expect(recorder.record(textEvent('{"n":4}'))).toMatchObject({ status: "lost", sequence: 4, reason: "buffer_overflow" });
    expect(recorder.status()).toMatchObject({ completeness: "incomplete", bufferedEvents: 2 });
    await recorder.flush();
    expect(recorder.record(textEvent('{"n":5}'))).toMatchObject({ status: "recorded", sequence: 5 });
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect((await store.readEventRange(TRACE_ID, 1, 5)).map((event) => event.sequence)).toEqual([1, 2, 5]);
    expect(manifest.completeness.losses).toEqual([{ reason: "buffer_overflow", range: { from: 3, to: 4 }, detail: "the buffer was full (2 events awaiting flush)" }]);
    const verdict = await evaluateStored(store, manifest);
    expect(verdict.status).toBe("incomplete");
    expect(verdict.issues.map((issue) => [issue.code, issue.range])).toEqual([["buffer_overflow", { from: 3, to: 4 }]]);
  });

  it("overflow: artifact bytes past the byte bound are declared lost and not inventoried", async () => {
    const { recorder } = newRecorder({ maxBufferedArtifactBytes: 4 });
    expect(recorder.recordArtifact(artifactInput(new Uint8Array(3)))).toMatchObject({ status: "recorded" });
    expect(recorder.recordArtifact(artifactInput(new Uint8Array(3)))).toMatchObject({ status: "lost", reason: "buffer_overflow" });
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(manifest.artifacts.map((artifact) => artifact.sequence)).toEqual([1]);
  });

  it("marks checkpoints only at sequences already delivered", async () => {
    const { recorder } = newRecorder();
    recorder.record(textEvent("{}", { correlation: correlation({ observationRevision: "obs-1" }) }));
    expect(recorder.markCheckpoint({ id: "start", sequence: 1, observationRevision: "obs-1" })).toEqual({ status: "marked" });
    expect(recorder.markCheckpoint({ id: "start", sequence: 1, observationRevision: "obs-1" })).toEqual({ status: "refused", reason: "duplicate_id" });
    expect(recorder.markCheckpoint({ id: "later", sequence: 2, observationRevision: null })).toEqual({ status: "refused", reason: "unknown_sequence" });
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(manifest.checkpoints).toEqual([{ id: "start", sequence: 1, observationRevision: "obs-1" }]);
  });

  it("writes the manifest identity: episode, activity, origin, versions, capabilities and context", async () => {
    const { recorder } = newRecorder();
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(manifest).toMatchObject({
      traceId: TRACE_ID,
      episodeId: "run-live-1",
      activity: "test",
      origin: { kind: "live" },
      traceSchemaVersion: 1,
      captureBoundaryVersion: 1,
      contractVersions: { protocol: "1", domain: "web-automation@3" },
      capabilities: { actions: ["observe", "read"], tracing: true },
      context: { schema: { name: "task-context", version: "1" }, value: { goalContractVersion: "g-1", inputs: { query: "lamps" } } },
      streams: ["gateway", "control", "artifact"],
      clockOrigin: { epochMs: Date.parse("2026-10-19T10:00:00.000Z"), observedAt: "2026-10-19T10:00:00.000Z" },
      completeness: { status: "complete", lastSequence: 0, losses: [] },
      terminationReason: "completed"
    });
    expect(Object.isFrozen(manifest)).toBe(true);
  });
});
