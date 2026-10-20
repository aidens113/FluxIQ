// A stored chunk's raw bytes, proven to be the bytes its digest names. A chunk
// whose bytes do not match (a damaged row, an unknown encoding) throws: it is
// never passed on as part of an event.
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export function unpackGatewayTraceChunk(input: { digest: Buffer; encoding: string; byteLength: number; stored: Buffer }): Buffer {
  const name = input.digest.toString("hex");
  const bytes = rawBytes(input.encoding, input.stored, name);
  if (bytes.byteLength !== input.byteLength) throw new Error(`gateway trace chunk ${name} holds ${bytes.byteLength} bytes, not ${input.byteLength}`);
  const digest = createHash("sha256").update(bytes).digest();
  if (!digest.equals(input.digest)) throw new Error(`gateway trace chunk ${name} does not match its digest`);
  return bytes;
}

function rawBytes(encoding: string, stored: Buffer, name: string): Buffer {
  if (encoding === "raw") return stored;
  if (encoding === "deflate") return inflateRawSync(stored);
  throw new Error(`gateway trace chunk ${name} has unknown encoding ${JSON.stringify(encoding)}`);
}
