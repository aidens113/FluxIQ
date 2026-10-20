// @fluxiq-test-group real-sql
// The memory store's behaviour suite (client-gateway/trace/tests/memory-store.test.ts),
// run against the reference memory store and the persisted project store
// alike: the persisted store must answer exactly as the reference does.
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceStore } from "../../../../../../client-gateway/trace/index.ts";
import { ClientGatewayTraceMemoryStore, clientGatewayTraceArtifactDigest } from "../../../../../../client-gateway/trace/index.ts";
import { TRACE_ID, artifactInput, correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

type StoreKind = { name: string; open(): Promise<ClientGatewayTraceStore> };

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const KINDS: readonly StoreKind[] = [
  {
    name: "ClientGatewayTraceMemoryStore",
    open: async () => new ClientGatewayTraceMemoryStore()
  },
  {
    name: "AutomationStudioProjectGatewayTraceStore",
    open: async () => {
      const fixture = await SqliteTraceFixture.create();
      cleanups.push(() => fixture.dispose());
      return fixture.store;
    }
  }
];

async function storedTrace(store: ClientGatewayTraceStore) {
  const { recorder } = newRecorder({ store });
  recorder.record(textEvent('{"n":1}', { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent('{"n":2}', { correlation: correlation({ recordingId: "rec-1" }) }));
  const result = recorder.record(textEvent('{"n":3}', { correlation: correlation({ commandId: "cmd-1" }) }));
  const causeId = result.status === "recorded" ? result.eventId : "missing";
  recorder.record(textEvent('{"n":4}', { correlation: correlation({ causationEventId: causeId }) }));
  recorder.recordArtifact(artifactInput(new Uint8Array([7, 8])));
  const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
  return { manifest, causeId };
}

describe.each(KINDS)("$name behaves as the reference trace store", (kind) => {
  it("reads an event range by sequence", async () => {
    const store = await kind.open();
    await storedTrace(store);
    expect((await store.readEventRange(TRACE_ID, 2, 4)).map((event) => event.sequence)).toEqual([2, 3, 4]);
    expect((await store.readEventRange(TRACE_ID, 5, 99)).map((event) => event.sequence)).toEqual([5]);
    expect(await store.readEventRange(TRACE_ID, 6, 99)).toEqual([]);
  });

  it("reads events by correlation id", async () => {
    const store = await kind.open();
    const { causeId } = await storedTrace(store);
    expect((await store.readEventsByCorrelation(TRACE_ID, "commandId", "cmd-1")).map((event) => event.sequence)).toEqual([1, 3]);
    expect((await store.readEventsByCorrelation(TRACE_ID, "recordingId", "rec-1")).map((event) => event.sequence)).toEqual([2]);
    expect((await store.readEventsByCorrelation(TRACE_ID, "causationEventId", causeId)).map((event) => event.sequence)).toEqual([4]);
    expect(await store.readEventsByCorrelation(TRACE_ID, "commandId", "cmd-none")).toEqual([]);
  });

  it("returns events equal to what was recorded, deep-frozen", async () => {
    const store = await kind.open();
    await storedTrace(store);
    const [first] = await store.readEventRange(TRACE_ID, 1, 1);
    expect(first?.payload).toEqual({ encoding: "text", text: '{"n":1}' });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.correlation)).toBe(true);
  });

  it("reads artifact bytes by id as fresh copies, and lists what it holds with digests", async () => {
    const store = await kind.open();
    const { manifest } = await storedTrace(store);
    const entry = manifest.artifacts[0]!;
    const bytes = await store.readArtifact(TRACE_ID, entry.id);
    expect([...bytes!]).toEqual([7, 8]);
    bytes![0] = 0;
    expect([...(await store.readArtifact(TRACE_ID, entry.id))!]).toEqual([7, 8]);
    expect(await store.listArtifacts(TRACE_ID)).toEqual([{ id: entry.id, sha256: entry.sha256, byteLength: 2 }]);
    expect(entry.sha256).toBe(clientGatewayTraceArtifactDigest(new Uint8Array([7, 8])));
    expect(await store.readArtifact(TRACE_ID, "absent")).toBeUndefined();
  });

  it("reads the manifest, and refuses reads of a trace it never held rather than answering empty", async () => {
    const store = await kind.open();
    const { manifest } = await storedTrace(store);
    expect(await store.readManifest(TRACE_ID)).toEqual(manifest);
    expect(await store.readManifest("never")).toBeUndefined();
    await expect(store.readEventRange("never", 1, 2)).rejects.toThrow(/not in this store/);
    await expect(store.readEventsByCorrelation("never", "commandId", "cmd-1")).rejects.toThrow(/not in this store/);
    await expect(store.readArtifact("never", "a1")).rejects.toThrow(/not in this store/);
    await expect(store.listArtifacts("never")).rejects.toThrow(/not in this store/);
  });

  it("refuses an out-of-order or foreign append, all or nothing", async () => {
    const source = await kind.open();
    await storedTrace(source);
    const [one, two] = await source.readEventRange(TRACE_ID, 1, 2);
    const fresh = await kind.open();
    await fresh.appendEvents(TRACE_ID, [two!]);
    await expect(fresh.appendEvents(TRACE_ID, [one!])).rejects.toThrow(/does not follow 2/);
    await expect(fresh.appendEvents("other", [one!])).rejects.toThrow(/belongs to trace/);
    expect((await fresh.readEventRange(TRACE_ID, 1, 9)).map((event) => event.sequence)).toEqual([2]);
  });

  it("keeps nothing of a batch that fails part-way", async () => {
    const source = await kind.open();
    await storedTrace(source);
    const [one, two, three] = await source.readEventRange(TRACE_ID, 1, 3);
    const fresh = await kind.open();
    await fresh.appendEvents(TRACE_ID, [one!]);
    await expect(fresh.appendEvents(TRACE_ID, [three!, two!])).rejects.toThrow(/does not follow 3/);
    expect((await fresh.readEventRange(TRACE_ID, 1, 9)).map((event) => event.sequence)).toEqual([1]);
  });

  it("refuses to overwrite an artifact id with different bytes", async () => {
    const store = await kind.open();
    await store.writeArtifact(TRACE_ID, "a1", new Uint8Array([1]));
    await store.writeArtifact(TRACE_ID, "a1", new Uint8Array([1]));
    await expect(store.writeArtifact(TRACE_ID, "a1", new Uint8Array([2]))).rejects.toThrow(/different contents/);
    expect([...(await store.readArtifact(TRACE_ID, "a1"))!]).toEqual([1]);
  });
});
