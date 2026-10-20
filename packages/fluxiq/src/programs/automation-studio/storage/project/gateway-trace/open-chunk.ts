// A chunk row's raw bytes: opened with the project's content protection when
// the row is sealed, then inflated and checked against its digest in the row's
// own form (`unpack-chunk.ts`). A sealed row with no protection to open it, a key that
// is gone, or a seal that does not authenticate throws: a protected chunk is
// never read as empty or passed on unopened. An unsealed row (written before
// chunks were protected, or by a store with no protection) reads as it is.
import { GATEWAY_TRACE_CHUNK_MEDIA_TYPE } from "./chunk-media-type.ts";
import type { GatewayTraceChunkSealing } from "./types.ts";
import { unpackGatewayTraceChunk } from "./unpack-chunk.ts";

export async function openGatewayTraceChunk(
  sealing: GatewayTraceChunkSealing,
  row: { digest: Buffer; addressKeyId: string | null; encoding: string; byteLength: number; stored: Buffer; encryption: string | null }
): Promise<Buffer> {
  const stored = await openedBytes(sealing, row);
  return unpackGatewayTraceChunk({ digest: row.digest, addressKeyId: row.addressKeyId, keyring: sealing.keyring, encoding: row.encoding, byteLength: row.byteLength, stored });
}

async function openedBytes(sealing: GatewayTraceChunkSealing, row: { digest: Buffer; stored: Buffer; encryption: string | null }): Promise<Buffer> {
  if (row.encryption === null) return row.stored;
  const name = row.digest.toString("hex");
  if (sealing.protection === undefined) {
    throw new Error(`gateway trace chunk ${name} is protected and cannot be opened without the project's content protection`);
  }
  try {
    return await sealing.protection.open({
      projectId: sealing.projectId,
      mediaType: GATEWAY_TRACE_CHUNK_MEDIA_TYPE,
      content: row.stored,
      encryption: row.encryption
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`gateway trace chunk ${name} could not be opened: ${reason}`, { cause: error });
  }
}
