// An event's JSON as it will be written: inline when short and inline bodies
// are allowed, otherwise its UTF-8 bytes cut into content-defined chunks, each
// with its SHA-256. A store with a content protection allows no inline body,
// so every event's JSON is held in chunks it seals (lane T P3-E). Pure work,
// done before the write transaction opens.
import { createHash } from "node:crypto";
import { GATEWAY_TRACE_CHUNK_BOUNDS } from "./chunk-bounds.ts";
import { splitGatewayTraceContentDefined } from "./split-content-defined.ts";
import type { GatewayTraceChunk, GatewayTraceEventBody } from "./types.ts";

export function prepareGatewayTraceEventBody(input: { json: string; inlineAllowed: boolean }): GatewayTraceEventBody {
  const bytes = Buffer.from(input.json, "utf8");
  if (input.inlineAllowed && bytes.byteLength < GATEWAY_TRACE_CHUNK_BOUNDS.inlineBelowBytes) return { kind: "inline", json: input.json };
  const chunks: GatewayTraceChunk[] = splitGatewayTraceContentDefined(bytes).map((piece) => ({
    digest: createHash("sha256").update(piece).digest(),
    bytes: piece
  }));
  const digests = Buffer.concat(chunks.map((chunk) => chunk.digest));
  return { kind: "chunked", byteLength: bytes.byteLength, digests, chunks };
}
