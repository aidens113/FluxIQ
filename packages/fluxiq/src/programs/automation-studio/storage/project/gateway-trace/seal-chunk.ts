// Seals a chunk's packed bytes with the project's content protection, the same
// seal and envelope protected content-store objects get
// (`../content-protection.ts`). A chunk is deflated first and sealed after:
// ciphertext does not compress, so sealing first would store every chunk at its
// raw size. Without a protection the packed bytes are kept as they are, marked
// unsealed (`encryption: null`).
import { GATEWAY_TRACE_CHUNK_MEDIA_TYPE } from "./chunk-media-type.ts";
import type { GatewayTraceChunkSealing } from "./types.ts";

export async function sealGatewayTraceChunk(sealing: GatewayTraceChunkSealing, packed: Buffer): Promise<{ stored: Buffer; encryption: string | null }> {
  if (sealing.protection === undefined) return { stored: packed, encryption: null };
  const sealed = await sealing.protection.seal({
    projectId: sealing.projectId,
    mediaType: GATEWAY_TRACE_CHUNK_MEDIA_TYPE,
    content: packed
  });
  return { stored: sealed.content, encryption: sealed.encryption };
}
