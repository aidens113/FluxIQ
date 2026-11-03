// @fluxiq-test-group real-sql
// What only the persisted store has to prove: traces survive the pool being
// closed and reopened, large events are kept as chunks the trace uses and come
// back identical, manifests list by episode, a deleted trace takes its rows and
// its content references with it, and the migrations sort after the
// administration ledger they are appended to.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRACE_ID, artifactInput, correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION } from "../../gateway-trace-schema/index.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

let fixture: SqliteTraceFixture;

beforeEach(async () => {
  fixture = await SqliteTraceFixture.create();
});

afterEach(async () => {
  await fixture.dispose();
});

const LARGE_TEXT = JSON.stringify({ html: "<p>".padEnd(300 * 1024, "x") });

async function recordTrace(store: AutomationStudioProjectGatewayTraceStore, traceId = TRACE_ID, episodeId = "run-live-1") {
  const { recorder } = newRecorder({ store }, { traceId, episodeId });
  recorder.record(textEvent('{"n":1}', { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent(LARGE_TEXT, { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.recordArtifact(artifactInput(new Uint8Array([1, 2, 3])));
  return recorder.close({ terminationReason: "completed", terminationDetail: null });
}

describe("AutomationStudioProjectGatewayTraceStore persistence", () => {
  it("reads back everything after the pool is closed and reopened", async () => {
    const manifest = await recordTrace(fixture.store);
    const before = await fixture.store.readEventRange(TRACE_ID, 1, 99);
    const reopened = await fixture.reopen();
    expect(await reopened.readManifest(TRACE_ID)).toEqual(manifest);
    expect(await reopened.readEventRange(TRACE_ID, 1, 99)).toEqual(before);
    expect((await reopened.readEventsByCorrelation(TRACE_ID, "commandId", "cmd-1")).map((event) => event.sequence)).toEqual([1, 2]);
    const entry = manifest.artifacts[0]!;
    expect([...(await reopened.readArtifact(TRACE_ID, entry.id))!]).toEqual([1, 2, 3]);
    expect(await reopened.listArtifacts(TRACE_ID)).toEqual([{ id: entry.id, sha256: entry.sha256, byteLength: 3 }]);
  });

  it("keeps a large event as chunks its trace uses, no content object, and reads it back identical", async () => {
    await recordTrace(fixture.store);
    const rows = await fixture.rows<{ sequence: number; inline: number; chunked: number; event_object_id: string | null }>(
      "select sequence, event_json is not null as inline, event_chunk_digests is not null as chunked, event_object_id from client_gateway_trace_events where trace_id = ? order by sequence",
      [TRACE_ID]
    );
    expect(rows.map((row) => [row.inline, row.chunked, row.event_object_id])).toEqual([[1, 0, null], [0, 1, null], [1, 0, null]]);
    const uses = await fixture.rows<{ trace_id: string }>("select distinct trace_id from client_gateway_trace_chunk_uses");
    expect(uses).toEqual([{ trace_id: TRACE_ID }]);
    const references = await fixture.rows<{ purpose: string }>("select purpose from object_references where owner_kind = 'client_gateway_trace'");
    expect(references).toEqual([{ purpose: "artifact" }]);
    const [large] = await (await fixture.reopen()).readEventRange(TRACE_ID, 2, 2);
    expect(large?.payload).toEqual({ encoding: "text", text: LARGE_TEXT });
  });

  it("round-trips the artifact digests an event references, inline or in the content store, across a reopen", async () => {
    const { recorder } = newRecorder({ store: fixture.store });
    const referenced = ["a".repeat(64), "b".repeat(64)];
    recorder.record(textEvent('{"type":"client.action_result"}', { referencedDigests: referenced }));
    recorder.record(textEvent(LARGE_TEXT, { referencedDigests: referenced }));
    recorder.record(textEvent("{}"));
    await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const reopened = await fixture.reopen();
    const events = await reopened.readEventRange(TRACE_ID, 1, 3);
    expect(events.map((event) => event.referencedDigests)).toEqual([referenced, referenced, []]);
  });

  it("lists manifests, optionally by episode, and never mixes episodes", async () => {
    await recordTrace(fixture.store, "trace-a", "run-1");
    await recordTrace(fixture.store, "trace-b", "run-2");
    await recordTrace(fixture.store, "trace-c", "run-1");
    expect((await fixture.store.listManifests({})).map((manifest) => manifest.traceId).sort()).toEqual(["trace-a", "trace-b", "trace-c"]);
    expect((await fixture.store.listManifests({ episodeId: "run-1" })).map((manifest) => manifest.traceId).sort()).toEqual(["trace-a", "trace-c"]);
    expect(await fixture.store.listManifests({ episodeId: "run-none" })).toEqual([]);
  });

  it("deletes a trace's rows and content references, leaving other traces whole, and then refuses to read it", async () => {
    await recordTrace(fixture.store, "trace-a", "run-1");
    await recordTrace(fixture.store, "trace-b", "run-1");
    await fixture.store.deleteTrace("trace-a");
    await expect(fixture.store.readEventRange("trace-a", 1, 9)).rejects.toThrow(/not in this store/);
    expect(await fixture.store.readManifest("trace-a")).toBeUndefined();
    await expect(fixture.store.deleteTrace("trace-a")).rejects.toThrow(/not in this store/);
    const references = await fixture.rows<{ owner_id: string }>("select owner_id from object_references where owner_kind = 'client_gateway_trace' order by owner_id");
    expect(new Set(references.map((row) => row.owner_id))).toEqual(new Set(["trace-b"]));
    expect((await fixture.store.readEventRange("trace-b", 1, 9)).map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(await fixture.store.listArtifacts("trace-b")).toHaveLength(1);
  });

  it("refuses a trace id the content store cannot name as an owner", async () => {
    await expect(fixture.store.writeArtifact("bad trace id", "a1", new Uint8Array([1]))).rejects.toThrow(/trace id/);
  });

  it("refuses an event range bound that is not a number", async () => {
    await recordTrace(fixture.store);
    await expect(fixture.store.readEventRange(TRACE_ID, Number.NaN, 2)).rejects.toThrow(/range/);
    expect((await fixture.store.readEventRange(TRACE_ID, 2, Number.POSITIVE_INFINITY)).map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("sorts its migrations after every administration migration they are appended to, chunks after traces", () => {
    const ids = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.map((migration) => migration.id);
    const last = [...ids].sort().at(-1) ?? "";
    expect(ids).not.toContain(AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION.id);
    expect(ids).not.toContain(AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION.id);
    expect(AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION.id > last).toBe(true);
    expect(AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION.id > AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION.id).toBe(true);
  });
});
