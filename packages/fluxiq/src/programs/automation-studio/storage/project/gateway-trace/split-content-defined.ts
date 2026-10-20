// Cuts bytes into content-defined chunks (see `chunk-bounds.ts` for the rule). The
// chunks are views into the input, in order, and concatenate to it exactly;
// every chunk but the last is between the minimum and maximum size.
import { createHash } from "node:crypto";
import { GATEWAY_TRACE_CHUNK_BOUNDS } from "./chunk-bounds.ts";

/** 256 fixed pseudo-random words, derived from a stable seed so cuts never move between releases. */
const GEAR = buildGearTable();

export function splitGatewayTraceContentDefined(bytes: Uint8Array): readonly Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let start = 0;
  while (start < bytes.byteLength) {
    const end = cutPoint(bytes, start);
    chunks.push(bytes.subarray(start, end));
    start = end;
  }
  return chunks;
}

function cutPoint(bytes: Uint8Array, start: number): number {
  const { minBytes, averageBytes, maxBytes, strictMask, looseMask } = GATEWAY_TRACE_CHUNK_BOUNDS;
  const total = bytes.byteLength;
  if (total - start <= minBytes) return total;
  const limit = Math.min(total, start + maxBytes);
  const normal = Math.min(limit, start + averageBytes);
  let hash = 0;
  let index = start + minBytes;
  for (; index < normal; index += 1) {
    hash = ((hash << 1) + GEAR[bytes[index]!]!) | 0;
    if ((hash & strictMask) === 0) return index + 1;
  }
  for (; index < limit; index += 1) {
    hash = ((hash << 1) + GEAR[bytes[index]!]!) | 0;
    if ((hash & looseMask) === 0) return index + 1;
  }
  return limit;
}

function buildGearTable(): Int32Array {
  const table = new Int32Array(256);
  for (let value = 0; value < 256; value += 1) {
    const digest = createHash("sha256").update(`fluxiq.gateway-trace.gear.${value}`).digest();
    table[value] = digest.readInt32BE(0);
  }
  return table;
}
