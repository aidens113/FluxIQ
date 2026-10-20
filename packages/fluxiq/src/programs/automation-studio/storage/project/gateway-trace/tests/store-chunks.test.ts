// @fluxiq-test-group real-sql
// Lane T P3: large event bodies are kept as content-defined chunks stored once
// per project. Reads give back exactly the bytes written (T01 parity), a chunk
// two events or two traces share is stored once, deleting a trace frees only
// the chunks no other trace uses, and a missing or damaged chunk makes its
// event unreadable rather than shortened.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { correlation, eventInput, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

let fixture: SqliteTraceFixture;

beforeEach(async () => {
  fixture = await SqliteTraceFixture.create();
});

afterEach(async () => {
  await fixture.dispose();
});

/** Serialized records, about `count` * 70 bytes; `changed` alters one record's stock. */
function records(count: number, salt: string, changed = -1): string {
  const items: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const word = createHash("sha256").update(`${salt}:${index}`).digest("hex").slice(0, 16);
    items.push(`{"id":"e${index}","label":"Item ${word}","stock":${index === changed ? 9999 : index % 89}}`);
  }
  return `{"type":"client.state_update","entries":[${items.join(",")}]}`;
}

/** Text whose exact spelling matters: absent versus null, number spellings, key order, escapes, every UTF-16 code unit. */
function trickyText(): string {
  const units: string[] = [];
  for (let unit = 0; unit < 0x10000; unit += 1) units.push(String.fromCharCode(unit));
  const spellings = '{"z":1,"a":null,"n":1.0,"e":1E3,"m":-0,"f":0.10000000000000001,"big":12345678901234567890,"esc":"\\u00e9\\n\\"q\\"","nested":{"b":[],"a":{}}}';
  return `${spellings}${units.join("")}${"😀".repeat(9_000)}${spellings}`;
}

/** Records events through a writer that keeps a copy of exactly what reached the store. */
function teeRecorder(traceId: string) {
  const written: ClientGatewayTraceEvent[] = [];
  const store = fixture.store;
  const writer: ClientGatewayTraceStoreWriter = {
    writeArtifact: (id, artifactId, bytes) => store.writeArtifact(id, artifactId, bytes),
    appendEvents: async (id, events) => {
      await store.appendEvents(id, events);
      written.push(...events);
    },
    writeManifest: (manifest) => store.writeManifest(manifest)
  };
  const { recorder } = newRecorder({ store: writer }, { traceId, episodeId: `run-${traceId}` });
  return { recorder, written };
}

async function chunkCount(): Promise<number> {
  const [row] = await fixture.rows<{ count: number }>("select count(*) as count from client_gateway_trace_chunks");
  return row?.count ?? -1;
}

async function recordTexts(traceId: string, texts: readonly string[]): Promise<void> {
  const { recorder } = teeRecorder(traceId);
  for (const text of texts) recorder.record(textEvent(text, { correlation: correlation({ commandId: "cmd-1" }) }));
  await recorder.close({ terminationReason: "completed", terminationDetail: null });
}

describe("chunked event bodies", () => {
  it("reads back byte for byte what was written, inline and chunked, text and json, across a reopen", async () => {
    const { recorder, written } = teeRecorder("trace-exact");
    const tricky = trickyText();
    recorder.record(textEvent(tricky));
    recorder.record(textEvent('{"small":true,"absent_vs_null":null}'));
    recorder.record(eventInput({ encoding: "json", value: { b: null, a: [1.5, -2, "x".repeat(40_000)], c: { y: true, x: false } } }));
    await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const layout = await fixture.rows<{ inline: number; chunked: number }>(
      "select event_json is not null as inline, event_chunk_digests is not null as chunked from client_gateway_trace_events where trace_id = ? order by sequence",
      ["trace-exact"]
    );
    expect(layout).toEqual([{ inline: 0, chunked: 1 }, { inline: 1, chunked: 0 }, { inline: 0, chunked: 1 }]);
    const read = await (await fixture.reopen()).readEventRange("trace-exact", 1, 99);
    expect(read.map((event) => JSON.stringify(event))).toEqual(written.map((event) => JSON.stringify(event)));
    const first = read[0]?.payload;
    expect(first?.encoding === "text" ? first.text === tricky : false).toBe(true);
    expect(Object.isFrozen(read[0])).toBe(true);
  });

  it("stores a chunk once across events that differ slightly", async () => {
    await recordTexts("trace-one", [records(8_000, "s")]);
    const single = await chunkCount();
    expect(single).toBeGreaterThan(20);
    await recordTexts("trace-two", [records(8_000, "s", 4_000), records(8_000, "s", 6_000)]);
    expect((await chunkCount()) - single).toBeLessThanOrEqual(8);
    const events = await fixture.store.readEventRange("trace-two", 1, 2);
    expect(events.map((event) => (event.payload.encoding === "text" ? event.payload.text : ""))).toEqual([records(8_000, "s", 4_000), records(8_000, "s", 6_000)]);
  });

  it("stores a chunk once across traces, and records each trace's use of it", async () => {
    const text = records(6_000, "shared");
    await recordTexts("trace-a", [text]);
    const once = await chunkCount();
    await recordTexts("trace-b", [text]);
    // Only the chunks around the envelope's head (trace and event ids) and tail (episode) differ between the two traces.
    expect((await chunkCount()) - once).toBeLessThanOrEqual(4);
    const [shared] = await fixture.rows<{ count: number }>(
      `select count(*) as count from client_gateway_trace_chunk_uses a
       join client_gateway_trace_chunk_uses b on a.digest = b.digest
       where a.trace_id = 'trace-a' and b.trace_id = 'trace-b'`
    );
    expect(shared?.count).toBeGreaterThanOrEqual(once - 4);
    const uses = await fixture.rows<{ trace_id: string; count: number }>(
      "select trace_id, count(*) as count from client_gateway_trace_chunk_uses group by trace_id order by trace_id"
    );
    expect(uses.map((row) => row.trace_id)).toEqual(["trace-a", "trace-b"]);
    expect(uses[0]?.count).toBe(once);
  });

  it("frees on delete only the chunks no other trace uses", async () => {
    const shared = records(6_000, "shared");
    await recordTexts("trace-b", [shared]);
    const sharedCount = await chunkCount();
    await recordTexts("trace-a", [shared, records(6_000, "only-a")]);
    expect(await chunkCount()).toBeGreaterThan(sharedCount);
    await fixture.store.deleteTrace("trace-a");
    expect(await chunkCount()).toBe(sharedCount);
    expect(await fixture.rows("select * from client_gateway_trace_chunk_uses where trace_id = 'trace-a'")).toEqual([]);
    const [event] = await fixture.store.readEventRange("trace-b", 1, 1);
    expect(event?.payload).toEqual({ encoding: "text", text: shared });
    await fixture.store.deleteTrace("trace-b");
    expect(await chunkCount()).toBe(0);
  });

  it("refuses to read an event whose chunk was removed, by range and by correlation", async () => {
    await recordTexts("trace-gap", [records(6_000, "gap"), '{"n":2}']);
    await fixture.sql("delete from client_gateway_trace_chunks where rowid = (select max(rowid) from client_gateway_trace_chunks)");
    await expect(fixture.store.readEventRange("trace-gap", 1, 9)).rejects.toThrow(/trace-gap#1 is not held: its chunk [0-9a-f]{64} is missing/);
    await expect(fixture.store.readEventsByCorrelation("trace-gap", "commandId", "cmd-1")).rejects.toThrow(/not held/);
    expect((await fixture.store.readEventRange("trace-gap", 2, 2)).map((event) => event.sequence)).toEqual([2]);
  });

  it("refuses to read an event whose chunk bytes were damaged", async () => {
    await recordTexts("trace-damaged", [records(6_000, "damaged")]);
    await fixture.sql(
      "update client_gateway_trace_chunks set encoding = 'raw', stored = zeroblob(byte_length) where rowid = (select min(rowid) from client_gateway_trace_chunks)"
    );
    await expect(fixture.store.readEventRange("trace-damaged", 1, 1)).rejects.toThrow(/does not match its digest/);
  });

  it("refuses to read an event whose chunk list was cut short", async () => {
    await recordTexts("trace-short", [records(6_000, "short")]);
    await fixture.sql("update client_gateway_trace_events set event_chunk_digests = substr(event_chunk_digests, 33) where trace_id = 'trace-short'");
    await expect(fixture.store.readEventRange("trace-short", 1, 1)).rejects.toThrow(/not held whole/);
  });
});
