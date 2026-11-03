// An event's JSON as it will be written: inline when short and inline bodies
// are allowed, otherwise its UTF-8 bytes cut into content-defined chunks, each
// with its digest. A store with a content protection allows no inline body,
// so every event's JSON is held in chunks it seals (lane T P3-E), and it passes
// its content-address keyring (t745): the body is then cut with the gear table
// of the keyring's current key and each digest is that key's address of the
// piece, so neither the digests nor the chunk lengths confirm a guessed body.
// Without a keyring the public gear and SHA-256 are used, as before. Pure work,
// done before the write transaction opens.
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import { GATEWAY_TRACE_CHUNK_BOUNDS } from "./chunk-bounds.ts";
import { gatewayTraceChunkDigest, gatewayTraceKeyedGearTable } from "./keyed-digests.ts";
import { splitGatewayTraceContentDefined } from "./split-content-defined.ts";
import type { GatewayTraceChunk, GatewayTraceEventBody } from "./types.ts";

export function prepareGatewayTraceEventBody(input: { json: string; inlineAllowed: boolean; keyring?: AutomationStudioContentAddressKeyring }): GatewayTraceEventBody {
  const bytes = Buffer.from(input.json, "utf8");
  if (input.inlineAllowed && bytes.byteLength < GATEWAY_TRACE_CHUNK_BOUNDS.inlineBelowBytes) return { kind: "inline", json: input.json };
  const keyring = input.keyring;
  const addressKeyId = keyring === undefined ? null : keyring.currentKeyId;
  const pieces = keyring === undefined ? splitGatewayTraceContentDefined(bytes) : splitGatewayTraceContentDefined(bytes, gatewayTraceKeyedGearTable(keyring, keyring.currentKeyId));
  const chunks: GatewayTraceChunk[] = pieces.map((piece) => ({
    digest: gatewayTraceChunkDigest({ keyring, addressKeyId, bytes: piece, name: "being written" }),
    addressKeyId,
    bytes: piece
  }));
  const digests = Buffer.concat(chunks.map((chunk) => chunk.digest));
  return { kind: "chunked", byteLength: bytes.byteLength, digests, addressKeyId, chunks };
}
