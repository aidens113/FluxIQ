// @fluxiq-test-group real-sql
// Measures what chunked event bodies save on a trace shaped like P2's (lane T
// P3): every event a view of 50-900 KB that differs slightly from the last time
// that screen was seen. "Before" is the 0030 layout, which kept each event's
// JSON verbatim (inline, or one uncompressed content object of the same
// bytes); "after" is what the chunk layout holds: stored chunk bytes, digest
// lists and inline JSON. Also times writes and reads per event.
//
// Always runs a short trace and checks the saving and the round trip. With
// FLUXIQ_TRACE_CHUNK_MEASURE=1 it runs the full 220-event trace and prints the
// numbers the P3 report quotes:
//   FLUXIQ_TRACE_CHUNK_MEASURE=1 pnpm exec vitest run src/programs/automation-studio/storage/project/gateway-trace/tests/store-chunk-measure.test.ts
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";
import { syntheticViewTexts } from "./synthetic-views.ts";

const FULL = process.env.FLUXIQ_TRACE_CHUNK_MEASURE === "1";
const TRACE = "trace-measure";

let fixture: SqliteTraceFixture;

beforeEach(async () => {
  fixture = await SqliteTraceFixture.create();
});

afterEach(async () => {
  await fixture.dispose();
});

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return total;
}

async function storedBytes(): Promise<{ chunks: number; chunkCount: number; rawChunkBytes: number; digestLists: number; inline: number }> {
  const [chunkRow] = await fixture.rows<{ chunks: number; chunkCount: number; rawChunkBytes: number }>(
    "select coalesce(sum(length(stored)), 0) as chunks, count(*) as chunkCount, coalesce(sum(byte_length), 0) as rawChunkBytes from client_gateway_trace_chunks"
  );
  const [eventRow] = await fixture.rows<{ digestLists: number; inline: number }>(
    "select coalesce(sum(length(event_chunk_digests)), 0) as digestLists, coalesce(sum(length(cast(event_json as blob))), 0) as inline from client_gateway_trace_events"
  );
  if (chunkRow === undefined || eventRow === undefined) throw new Error("the store's byte counts could not be read");
  return { ...chunkRow, ...eventRow };
}

async function measure(count: number) {
  const written: ClientGatewayTraceEvent[] = [];
  const store = fixture.store;
  const writer: ClientGatewayTraceStoreWriter = {
    writeArtifact: (traceId, artifactId, bytes) => store.writeArtifact(traceId, artifactId, bytes),
    appendEvents: async (traceId, events) => {
      await store.appendEvents(traceId, events);
      written.push(...events);
    },
    writeManifest: (manifest) => store.writeManifest(manifest)
  };
  const { recorder } = newRecorder({ store: writer }, { traceId: TRACE, episodeId: "run-measure" });
  let writeMs = 0;
  let index = 0;
  for (const text of syntheticViewTexts(count)) {
    recorder.record(textEvent(text, { messageType: index % 2 === 0 ? "client.action_result" : "client.state_update", correlation: correlation({ commandId: `cmd-${index >> 1}` }) }));
    const started = performance.now();
    await recorder.flush();
    writeMs += performance.now() - started;
    index += 1;
  }
  await recorder.close({ terminationReason: "completed", terminationDetail: null });
  const jsonTexts = written.map((event) => JSON.stringify(event));
  const before = jsonTexts.reduce((sum, json) => sum + Buffer.byteLength(json, "utf8"), 0);
  const perEventDeflate = jsonTexts.reduce((sum, json) => sum + deflateRawSync(Buffer.from(json, "utf8")).byteLength, 0);
  const bytes = await storedBytes();
  const after = bytes.chunks + bytes.digestLists + bytes.inline;
  const readStarted = performance.now();
  const read = await (await fixture.reopen()).readEventRange(TRACE, 1, Number.MAX_SAFE_INTEGER);
  const readMs = performance.now() - readStarted;
  let singleMs = 0;
  const samples = Math.min(20, count);
  for (let sample = 0; sample < samples; sample += 1) {
    const sequence = 1 + Math.floor((sample * count) / samples);
    const started = performance.now();
    await fixture.store.readEventRange(TRACE, sequence, sequence);
    singleMs += performance.now() - started;
  }
  const report = {
    events: count,
    beforeBytes: before,
    afterBytes: after,
    ratio: Number((after / before).toFixed(4)),
    perEventDeflateBytes: perEventDeflate,
    distinctChunks: bytes.chunkCount,
    meanRawChunkBytes: Math.round(bytes.rawChunkBytes / Math.max(1, bytes.chunkCount)),
    storedChunkBytes: bytes.chunks,
    digestListBytes: bytes.digestLists,
    inlineBytes: bytes.inline,
    projectDirectoryBytes: await directoryBytes(fixture.rootDir),
    writeMsPerEvent: Number((writeMs / count).toFixed(2)),
    readAllMsPerEvent: Number((readMs / count).toFixed(2)),
    readOneMsPerEvent: Number((singleMs / samples).toFixed(2))
  };
  console.log(`gateway trace chunk measure ${JSON.stringify(report)}`);
  return { report, read, jsonTexts };
}

describe("chunked event bodies on a P2-shaped trace", () => {
  it(
    FULL ? "measures a 220-event trace" : "stores a short trace in a fraction of the 0030 bytes and reads it back exactly",
    async () => {
      const { report, read, jsonTexts } = await measure(FULL ? 220 : 24);
      expect(read.map((event) => JSON.stringify(event))).toEqual(jsonTexts);
      expect(report.ratio).toBeLessThan(FULL ? 0.1 : 0.25);
    },
    FULL ? 600_000 : 60_000
  );
});
