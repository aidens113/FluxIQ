// Content-defined chunking: the chunks concatenate to the input, respect the
// bounds, fall at the same places for the same content, and an edit in the
// middle changes only the chunks around it, which is what lets near-identical
// views share storage.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GATEWAY_TRACE_CHUNK_BOUNDS } from "../chunk-bounds.ts";
import { splitGatewayTraceContentDefined } from "../split-content-defined.ts";

/** Deterministic, mildly repetitive bytes, shaped like serialized records. */
function recordBytes(count: number, salt = ""): Buffer {
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const word = createHash("sha256").update(`${salt}${index}`).digest("hex").slice(0, 12);
    lines.push(`{"id":"e${index}","label":"Item ${word}","stock":${index % 97}}`);
  }
  return Buffer.from(`[${lines.join(",")}]`, "utf8");
}

function digests(chunks: readonly Uint8Array[]): string[] {
  return chunks.map((chunk) => createHash("sha256").update(chunk).digest("hex"));
}

describe("splitGatewayTraceContentDefined", () => {
  it("returns chunks that concatenate to the input exactly, within the bounds", () => {
    const bytes = recordBytes(20_000);
    const chunks = splitGatewayTraceContentDefined(bytes);
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    const { minBytes, maxBytes, averageBytes } = GATEWAY_TRACE_CHUNK_BOUNDS;
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.byteLength).toBeGreaterThanOrEqual(minBytes);
      expect(chunk.byteLength).toBeLessThanOrEqual(maxBytes);
    }
    const mean = bytes.byteLength / chunks.length;
    expect(mean).toBeGreaterThan(averageBytes / 2);
    expect(mean).toBeLessThan(averageBytes * 2);
  });

  it("answers no chunk for no bytes and one chunk for fewer than the minimum", () => {
    expect(splitGatewayTraceContentDefined(new Uint8Array(0))).toEqual([]);
    const small = Buffer.from("x".repeat(100));
    expect(splitGatewayTraceContentDefined(small).map((chunk) => chunk.byteLength)).toEqual([100]);
  });

  it("cuts a run with no content signal at the maximum size", () => {
    const flat = new Uint8Array(GATEWAY_TRACE_CHUNK_BOUNDS.maxBytes * 3).fill(0x61);
    const sizes = splitGatewayTraceContentDefined(flat).map((chunk) => chunk.byteLength);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(GATEWAY_TRACE_CHUNK_BOUNDS.maxBytes);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(flat.byteLength);
  });

  it("cuts the same content at the same places", () => {
    const bytes = recordBytes(5_000);
    expect(digests(splitGatewayTraceContentDefined(bytes))).toEqual(digests(splitGatewayTraceContentDefined(Buffer.from(bytes))));
  });

  it("keeps all but the chunks around an insertion when one record is inserted mid-way", () => {
    const original = recordBytes(20_000);
    const middle = original.indexOf(',{"id":"e10000"');
    const edited = Buffer.concat([original.subarray(0, middle), Buffer.from(',{"id":"new","label":"Inserted","stock":1}'), original.subarray(middle)]);
    const before = new Set(digests(splitGatewayTraceContentDefined(original)));
    const after = digests(splitGatewayTraceContentDefined(edited));
    const fresh = after.filter((digest) => !before.has(digest));
    expect(fresh.length).toBeLessThanOrEqual(3);
    expect(after.length - fresh.length).toBeGreaterThan(before.size - 4);
  });
});
