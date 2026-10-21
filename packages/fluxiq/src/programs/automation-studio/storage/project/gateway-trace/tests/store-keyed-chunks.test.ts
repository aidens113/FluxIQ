// @fluxiq-test-group real-sql
// t745 u3a: a gateway trace store opened with the project's content protection
// cuts and addresses new chunks under the project's content-address key. Every
// chunk and event row names that key; reads give back exactly what was written;
// a view repeated within a trace and across traces of one project is still kept
// once; the same trace in another project shares no chunk digest; and a row
// whose key id or digest was tampered with makes the read throw, never answer.
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";
import { unpackGatewayTraceChunk } from "../../gateway-trace-chunk-codec/index.ts";
import { CHUNK_ROWS_SQL, EVENT_ROWS_SQL, digestsOf, eventTexts, hostProtection, projectKeyring, recordTrace, viewText } from "./keyed-trace-support.ts";
import type { KeyedChunkRow, KeyedEventRow } from "./keyed-trace-support.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

const TWIN_PROJECT = "project.gateway-trace-twin";

let fixture: SqliteTraceFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

describe("keyed gateway trace chunks in a protected store", () => {
  it("names the project's current address key on every chunk and event row, reads back byte for byte, and still dedupes", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    const view = viewText(4_000, "shared");
    const writtenA = await recordTrace(fixture.store, "trace-a", [view, view]);
    const writtenB = await recordTrace(fixture.store, "trace-b", [view]);
    const keyring = await projectKeyring(fixture.databasePool, SqliteTraceFixture.projectId, key);

    const eventsA = await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, ["trace-a"]);
    expect(eventsA).toHaveLength(2);
    for (const row of eventsA) {
      expect(row.json).toBeNull();
      expect(row.keyId).toBe(keyring.currentKeyId);
      expect(row.digests!.byteLength % 32).toBe(0);
    }
    const chunks = await fixture.rows<KeyedChunkRow>(CHUNK_ROWS_SQL);
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((row) => row.keyId === keyring.currentKeyId && row.encryption !== null && row.digest.byteLength === 32)).toBe(true);

    const store = await fixture.reopen({ protection: key });
    expect(eventTexts(await store.readEventRange("trace-a", 1, 99))).toEqual(eventTexts(writtenA));
    expect(eventTexts(await store.readEventRange("trace-b", 1, 99))).toEqual(eventTexts(writtenB));

    // Within a trace: the two events differ only around their ids, so most of the second's chunks are the first's.
    const references = eventsA.reduce((sum, row) => sum + digestsOf(row.digests).length, 0);
    const measureA = await store.measureTrace("trace-a");
    expect(measureA).toMatchObject({ events: 2, inlineEvents: 0, chunkedEvents: 2, digestListBytes: references * 32 });
    expect(measureA.chunks).toBeLessThanOrEqual(references / 2 + 4);
    // Across traces of one project: trace B's view is held by trace A's chunks.
    const measureB = await store.measureTrace("trace-b");
    expect(measureB.sharedChunks).toBeGreaterThanOrEqual(measureB.chunks - 4);
    const both = await store.measureTraceChunks(["trace-a", "trace-b"]);
    expect(both.chunks).toBe(chunks.length);
    expect(both.chunks).toBeLessThan(measureA.chunks + measureB.chunks);
  });

  it("shares no chunk digest with the same trace in another project under the same host key", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    const twin = await AutomationStudioProjectGatewayTraceStore.open({ pool: fixture.databasePool, projectId: TWIN_PROJECT, protection: key });
    try {
      const texts = [viewText(3_000, "twin"), viewText(500, "twin-small")];
      const here = await recordTrace(fixture.store, "trace-twin", texts);
      const there = await recordTrace(twin, "trace-twin", texts);
      expect(eventTexts(there)).toEqual(eventTexts(here));
      expect(eventTexts(await twin.readEventRange("trace-twin", 1, 99))).toEqual(eventTexts(here));

      const ours = await fixture.rows<KeyedChunkRow>(CHUNK_ROWS_SQL);
      const lease = await fixture.databasePool.acquire(TWIN_PROJECT);
      const theirs = await lease.database.all<KeyedChunkRow>(CHUNK_ROWS_SQL).finally(() => lease.release());
      expect(ours.length).toBeGreaterThan(10);
      expect(theirs.length).toBeGreaterThan(10);
      expect(ours[0]!.keyId).not.toBe(theirs[0]!.keyId);
      const oursHex = new Set(ours.map((row) => row.digest.toString("hex")));
      expect(theirs.filter((row) => oursHex.has(row.digest.toString("hex")))).toEqual([]);
    } finally {
      await twin.close();
    }
  });

  it("throws when a chunk row's key id or digest was tampered with, and reads again once it is put back", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    const written = await recordTrace(fixture.store, "trace-tamper", [viewText(4_000, "tamper")]);
    const [event] = await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, ["trace-tamper"]);
    const list = digestsOf(event!.digests);
    const first = list[0]!;
    const name = first.toString("hex");
    const keyId = event!.keyId!;
    const read = () => fixture!.store.readEventRange("trace-tamper", 1, 1);
    const setChunkKey = (value: string | null) => fixture!.sql("update client_gateway_trace_chunks set address_key_id = ? where digest = ?", [value, first]);
    const setEventAndChunkKeys = async (value: string | null) => {
      await fixture!.sql("update client_gateway_trace_events set event_chunk_address_key_id = ? where trace_id = 'trace-tamper' and sequence = 1", [value]);
      for (const digest of list) await fixture!.sql("update client_gateway_trace_chunks set address_key_id = ? where digest = ?", [value, digest]);
    };

    await setChunkKey(null);
    await expect(read()).rejects.toThrow(`event trace-tamper#1 is keyed under ${keyId} but its chunk ${name} under no key (plain SHA-256)`);
    await setChunkKey("cak.0000000000000000");
    await expect(read()).rejects.toThrow(`event trace-tamper#1 is keyed under ${keyId} but its chunk ${name} under cak.0000000000000000`);
    await setChunkKey(keyId);

    await setEventAndChunkKeys("cak.ffffffffffffffff");
    await expect(read()).rejects.toThrow(`gateway trace chunk ${name} is keyed under cak.ffffffffffffffff, a key this project's keyring does not hold`);
    // Read as the old form, a keyed chunk fails its SHA-256 check: a keyed row cannot be downgraded into reading.
    await setEventAndChunkKeys(null);
    await expect(read()).rejects.toThrow(`gateway trace chunk ${name} does not match its digest`);
    await setEventAndChunkKeys(keyId);

    const forged = Buffer.alloc(32, 0xab);
    await fixture.sql("update client_gateway_trace_chunks set digest = ? where digest = ?", [forged, first]);
    await expect(read()).rejects.toThrow(`event trace-tamper#1 is not held: its chunk ${name} is missing`);
    await fixture.sql("update client_gateway_trace_chunks set digest = ? where digest = ?", [first, forged]);

    expect(eventTexts(await read())).toEqual(eventTexts(written.slice(0, 1)));
  });

  it("refuses to verify a keyed chunk without a keyring", () => {
    const bytes = Buffer.from("chunk bytes", "utf8");
    expect(() => unpackGatewayTraceChunk({ digest: Buffer.alloc(32, 1), addressKeyId: "cak.0123456789abcdef", keyring: undefined, encoding: "raw", byteLength: bytes.byteLength, stored: bytes }))
      .toThrow(`gateway trace chunk ${"01".repeat(32)} is keyed under cak.0123456789abcdef and cannot be verified without the project's content address keyring`);
  });
});
