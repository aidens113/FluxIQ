// A stored chunk's raw bytes, proven to be the bytes its digest names, in the
// form its row records (plain SHA-256, or the keyring's address under the row's
// key, `keyed-digests.ts`). A chunk whose bytes do not match (a
// damaged row, an unknown encoding), or a keyed chunk the store cannot verify,
// throws: it is never passed on as part of an event.
import { inflateRawSync } from "node:zlib";
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import { gatewayTraceChunkDigest } from "./keyed-digests.ts";

export function unpackGatewayTraceChunk(input: {
  digest: Buffer;
  addressKeyId: string | null;
  keyring: AutomationStudioContentAddressKeyring | undefined;
  encoding: string;
  byteLength: number;
  stored: Buffer;
}): Buffer {
  const name = input.digest.toString("hex");
  const bytes = rawBytes(input.encoding, input.stored, name);
  if (bytes.byteLength !== input.byteLength) throw new Error(`gateway trace chunk ${name} holds ${bytes.byteLength} bytes, not ${input.byteLength}`);
  const digest = gatewayTraceChunkDigest({ keyring: input.keyring, addressKeyId: input.addressKeyId, bytes, name });
  if (!digest.equals(input.digest)) throw new Error(`gateway trace chunk ${name} does not match its digest`);
  return bytes;
}

function rawBytes(encoding: string, stored: Buffer, name: string): Buffer {
  if (encoding === "raw") return stored;
  if (encoding === "deflate") return inflateRawSync(stored);
  throw new Error(`gateway trace chunk ${name} has unknown encoding ${JSON.stringify(encoding)}`);
}
