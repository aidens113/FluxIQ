// A chunk's bytes as its row keeps them: raw-deflated when that is smaller,
// otherwise as they are. Deflate rather than brotli: chunks are written while
// a trace records and read on every replay, and deflate is several times faster
// at both for the same order of ratio on JSON.
import { deflateRawSync } from "node:zlib";
import type { GatewayTraceStoredChunk } from "./types.ts";

export function packGatewayTraceChunk(bytes: Uint8Array): GatewayTraceStoredChunk {
  const deflated = deflateRawSync(bytes);
  if (deflated.byteLength < bytes.byteLength) return { encoding: "deflate", stored: deflated };
  return { encoding: "raw", stored: Buffer.from(bytes) };
}
