// @fluxiq-test-group real-sql
// Lane T P3: the store answers what it keeps for a trace by name, so a Lab
// reads storage through `measureTrace` and `measureTraceChunks` instead of the
// tables. Small events are inline, a repeated large view is chunked once, a
// chunk two traces use is shared (and counted once over the pair), deleting
// one trace leaves the other's chunks its own, and a trace never held throws.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent } from "../../../../../../client-gateway/trace/index.ts";
import { artifactInput, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

let fixture: SqliteTraceFixture;

beforeEach(async () => {
  fixture = await SqliteTraceFixture.create();
});

afterEach(async () => {
  await fixture.dispose();
});

/** About 48 KB of words that do not repeat within the text: well above the inline limit. */
function largeView(salt: string): string {
  const words: string[] = [];
  for (let index = 0; words.length * 17 < 48_000; index += 1) words.push(createHash("sha256").update(`${salt}:${index}`).digest("hex").slice(0, 16));
  return words.join(" ");
}

/** Records the texts (and artifacts) into the store as one trace, closed. */
async function recordTrace(traceId: string, texts: readonly string[], artifacts: readonly Uint8Array[] = []): Promise<void> {
  const { recorder } = newRecorder({ store: fixture.store }, { traceId, episodeId: `run-${traceId}` });
  for (const bytes of artifacts) recorder.recordArtifact(artifactInput(bytes));
  for (const text of texts) recorder.record(textEvent(text));
  await recorder.close({ terminationReason: "completed", terminationDetail: null });
}

function jsonBytes(events: readonly ClientGatewayTraceEvent[]): number {
  return events.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event), "utf8"), 0);
}

describe("measuring a persisted trace", () => {
  it("counts small events as inline, with no chunks, and the artifacts it holds", async () => {
    await recordTrace("trace-small", ['{"n":1}', '{"n":2}'], [new Uint8Array([1, 2, 3]), new Uint8Array(10).fill(7)]);
    const events = await fixture.store.readEventRange("trace-small", 1, Number.MAX_SAFE_INTEGER);
    const measure = await fixture.store.measureTrace("trace-small");
    expect(measure).toEqual({
      traceId: "trace-small",
      events: events.length,
      logicalEventBytes: jsonBytes(events),
      inlineEvents: events.length,
      inlineBytes: jsonBytes(events),
      chunkedEvents: 0,
      chunkedLogicalBytes: 0,
      digestListBytes: 0,
      objectEvents: 0,
      objectBytes: 0,
      chunks: 0,
      chunkRawBytes: 0,
      storedChunkBytes: 0,
      sharedChunks: 0,
      sharedStoredChunkBytes: 0,
      artifacts: 2,
      artifactBytes: 13
    });
    expect(Object.isFrozen(measure)).toBe(true);
  });

  it("counts a repeated large view's chunks once, none of them shared", async () => {
    const view = largeView("alone");
    await recordTrace("trace-large", [view, view]);
    const events = await fixture.store.readEventRange("trace-large", 1, Number.MAX_SAFE_INTEGER);
    const measure = await fixture.store.measureTrace("trace-large");
    expect(measure.logicalEventBytes).toBe(jsonBytes(events));
    expect(measure.chunkedEvents).toBe(2);
    expect(measure.chunkedLogicalBytes).toBe(jsonBytes(events.filter((event) => Buffer.byteLength(JSON.stringify(event)) > 40_000)));
    expect(measure.digestListBytes % 32).toBe(0);
    expect(measure.chunks).toBeGreaterThan(0);
    expect(measure.chunks).toBeLessThan(measure.digestListBytes / 32);
    expect(measure.storedChunkBytes).toBeLessThan(measure.chunkedLogicalBytes * 0.6);
    expect({ shared: measure.sharedChunks, sharedBytes: measure.sharedStoredChunkBytes }).toEqual({ shared: 0, sharedBytes: 0 });
    expect(await fixture.store.measureTraceChunks(["trace-large"])).toEqual({ traces: 1, chunks: measure.chunks, storedChunkBytes: measure.storedChunkBytes });
  });

  it("names the chunks two traces share, counts them once over both, and frees the claim when one is deleted", async () => {
    const view = largeView("shared");
    await recordTrace("trace-a", [view]);
    await recordTrace("trace-b", [view]);
    const a = await fixture.store.measureTrace("trace-a");
    const b = await fixture.store.measureTrace("trace-b");
    for (const measure of [a, b]) {
      expect(measure.sharedChunks).toBeGreaterThan(measure.chunks / 2);
      expect(measure.sharedChunks).toBeLessThan(measure.chunks);
      expect(measure.sharedStoredChunkBytes).toBeLessThan(measure.storedChunkBytes);
    }
    expect(a.sharedChunks).toBe(b.sharedChunks);
    const pair = await fixture.store.measureTraceChunks(["trace-a", "trace-b", "trace-a"]);
    expect(pair).toEqual({
      traces: 2,
      chunks: a.chunks + (b.chunks - b.sharedChunks),
      storedChunkBytes: a.storedChunkBytes + (b.storedChunkBytes - b.sharedStoredChunkBytes)
    });
    await fixture.store.deleteTrace("trace-b");
    const alone = await fixture.store.measureTrace("trace-a");
    expect({ chunks: alone.chunks, shared: alone.sharedChunks, sharedBytes: alone.sharedStoredChunkBytes }).toEqual({ chunks: a.chunks, shared: 0, sharedBytes: 0 });
  });

  it("answers an empty set with no chunks", async () => {
    expect(await fixture.store.measureTraceChunks([])).toEqual({ traces: 0, chunks: 0, storedChunkBytes: 0 });
  });

  it("throws for a trace it never held, as every other read does", async () => {
    await recordTrace("trace-held", ['{"n":1}']);
    await expect(fixture.store.measureTrace("trace-absent")).rejects.toThrow(/trace trace-absent is not in this store/);
    await expect(fixture.store.measureTraceChunks(["trace-held", "trace-absent"])).rejects.toThrow(/trace trace-absent is not in this store/);
  });
});
