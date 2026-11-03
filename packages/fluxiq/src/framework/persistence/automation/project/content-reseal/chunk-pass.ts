// The trace chunk pass (t747 design note b): every sealed chunk row under a
// retiring key gets its stored bytes sealed again, in place. The digest, the
// address key, the encoding and the byte length stay: the digest is the keyed
// address of the chunk's raw bytes, not of the sealed form, so the events and
// chunk uses that name it are untouched. A keyed chunk is named by its digest;
// a chunk still under the plain SHA-256 is named by its row, never by that
// digest of page content.
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { GATEWAY_TRACE_CHUNK_MEDIA_TYPE } from "../gateway-trace-chunk-codec/index.ts";
import type { ContentResealContext, ContentResealPassResult } from "./context.ts";
import { resealSealedRows } from "./row-pass.ts";
import type { ContentResealRowSpec } from "./row-pass.ts";

type ChunkRow = { row_id: number; digest: Buffer; address_key_id: string | null; stored: Buffer; encryption: string };

const CHUNK_SPEC: ContentResealRowSpec<ChunkRow> = {
  kind: "chunk",
  mediaType: GATEWAY_TRACE_CHUNK_MEDIA_TYPE,
  page: (database: AutomationStudioProjectDatabase, after: ChunkRow | null, limit: number) => database.all<ChunkRow>(
    `select rowid as row_id, digest, address_key_id, stored, encryption from client_gateway_trace_chunks
     where encryption is not null and digest > ? order by digest limit ?`,
    [after?.digest ?? Buffer.alloc(0), limit]
  ),
  id: (row) => (row.address_key_id === null ? `row ${row.row_id}` : row.digest.toString("hex")),
  sealedForm: (row) => ({ content: Buffer.from(row.stored), encryption: row.encryption }),
  write: async (sql, row, fresh) => {
    const result = await sql.run(
      "update client_gateway_trace_chunks set stored = ?, encryption = ? where digest = ? and stored = ? and encryption = ?",
      [fresh.content, fresh.encryption, row.digest, row.stored, row.encryption]
    );
    return result.changes === 1;
  }
};

export function resealGatewayTraceChunkRows(context: ContentResealContext): Promise<ContentResealPassResult> {
  return resealSealedRows(context, CHUNK_SPEC);
}
