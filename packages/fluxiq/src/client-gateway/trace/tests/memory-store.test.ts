import { describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore, clientGatewayTraceArtifactDigest } from "../index.ts";
import { TRACE_ID, artifactInput, correlation, newRecorder, textEvent } from "./trace-builders.ts";

async function storedTrace() {
  const { recorder, store } = newRecorder();
  recorder.record(textEvent('{"n":1}', { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent('{"n":2}', { correlation: correlation({ recordingId: "rec-1" }) }));
  const result = recorder.record(textEvent('{"n":3}', { correlation: correlation({ commandId: "cmd-1" }) }));
  const causeId = result.status === "recorded" ? result.eventId : "missing";
  recorder.record(textEvent('{"n":4}', { correlation: correlation({ causationEventId: causeId }) }));
  recorder.recordArtifact(artifactInput(new Uint8Array([7, 8])));
  const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
  return { store, manifest, causeId };
}

describe("ClientGatewayTraceMemoryStore", () => {
  it("reads an event range by sequence", async () => {
    const { store } = await storedTrace();
    expect((await store.readEventRange(TRACE_ID, 2, 4)).map((event) => event.sequence)).toEqual([2, 3, 4]);
    expect((await store.readEventRange(TRACE_ID, 5, 99)).map((event) => event.sequence)).toEqual([5]);
    expect(await store.readEventRange(TRACE_ID, 6, 99)).toEqual([]);
  });

  it("reads events by correlation id", async () => {
    const { store, causeId } = await storedTrace();
    expect((await store.readEventsByCorrelation(TRACE_ID, "commandId", "cmd-1")).map((event) => event.sequence)).toEqual([1, 3]);
    expect((await store.readEventsByCorrelation(TRACE_ID, "recordingId", "rec-1")).map((event) => event.sequence)).toEqual([2]);
    expect((await store.readEventsByCorrelation(TRACE_ID, "causationEventId", causeId)).map((event) => event.sequence)).toEqual([4]);
    expect(await store.readEventsByCorrelation(TRACE_ID, "commandId", "cmd-none")).toEqual([]);
  });

  it("reads artifact bytes by id as fresh copies, and lists what it holds with digests", async () => {
    const { store, manifest } = await storedTrace();
    const entry = manifest.artifacts[0]!;
    const bytes = await store.readArtifact(TRACE_ID, entry.id);
    expect([...bytes!]).toEqual([7, 8]);
    expect(await store.listArtifacts(TRACE_ID)).toEqual([{ id: entry.id, sha256: entry.sha256, byteLength: 2 }]);
    expect(entry.sha256).toBe(clientGatewayTraceArtifactDigest(new Uint8Array([7, 8])));
    expect(await store.readArtifact(TRACE_ID, "absent")).toBeUndefined();
  });

  it("reads the manifest, and refuses reads of a trace it never held rather than answering empty", async () => {
    const { store, manifest } = await storedTrace();
    expect(await store.readManifest(TRACE_ID)).toEqual(manifest);
    expect(await store.readManifest("never")).toBeUndefined();
    await expect(store.readEventRange("never", 1, 2)).rejects.toThrow(/not in this store/);
    await expect(store.listArtifacts("never")).rejects.toThrow(/not in this store/);
  });

  it("refuses an out-of-order or foreign append, all or nothing", async () => {
    const { store } = await storedTrace();
    const [one, two] = await store.readEventRange(TRACE_ID, 1, 2);
    const fresh = new ClientGatewayTraceMemoryStore();
    await fresh.appendEvents(TRACE_ID, [two!]);
    await expect(fresh.appendEvents(TRACE_ID, [one!])).rejects.toThrow(/does not follow 2/);
    await expect(fresh.appendEvents("other", [one!])).rejects.toThrow(/belongs to trace/);
    expect((await fresh.readEventRange(TRACE_ID, 1, 9)).map((event) => event.sequence)).toEqual([2]);
  });

  it("refuses to overwrite an artifact id with different bytes", async () => {
    const store = new ClientGatewayTraceMemoryStore();
    await store.writeArtifact(TRACE_ID, "a1", new Uint8Array([1]));
    await store.writeArtifact(TRACE_ID, "a1", new Uint8Array([1]));
    await expect(store.writeArtifact(TRACE_ID, "a1", new Uint8Array([2]))).rejects.toThrow(/different contents/);
  });
});
