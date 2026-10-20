// Stores a batch's chunks once per project and records that the trace uses
// them. Runs inside the append transaction, so the existence check and the
// insert see the same state a concurrent trace deletion leaves: a chunk this
// batch counts on cannot be freed between the two. Only chunks the project
// does not hold yet are compressed and sealed (`seal-chunk.ts`), and a held
// chunk that is not sealed is sealed now when the store has a protection: a
// write never leaves page content it reuses unprotected.
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { packGatewayTraceChunk } from "./pack-chunk.ts";
import { sealGatewayTraceChunk } from "./seal-chunk.ts";
import type { GatewayTraceChunk, GatewayTraceChunkSealing } from "./types.ts";

/** Rows per multi-row statement; keeps every statement well under SQLite's bound-parameter limit. */
const ROWS_PER_STATEMENT = 400;

export async function writeGatewayTraceChunks(
  sql: AutomationStudioSqlExecutor,
  sealing: GatewayTraceChunkSealing,
  traceId: string,
  chunks: readonly GatewayTraceChunk[]
): Promise<void> {
  const distinct = new Map<string, GatewayTraceChunk>();
  for (const chunk of chunks) distinct.set(chunk.digest.toString("hex"), chunk);
  const all = [...distinct.values()];
  const held = await heldSealing(sql, all);
  for (const chunk of all) {
    const sealed = held.get(chunk.digest.toString("hex"));
    if (sealed === true) continue;
    if (sealed === false && sealing.protection === undefined) continue;
    const packed = packGatewayTraceChunk(chunk.bytes);
    const stored = await sealGatewayTraceChunk(sealing, packed.stored);
    if (sealed === false) {
      await sql.run(
        "update client_gateway_trace_chunks set encoding = ?, byte_length = ?, stored = ?, encryption = ? where digest = ? and encryption is null",
        [packed.encoding, chunk.bytes.byteLength, stored.stored, stored.encryption, chunk.digest]
      );
      continue;
    }
    await sql.run(
      `insert into client_gateway_trace_chunks (digest, encoding, byte_length, stored, encryption) values (?, ?, ?, ?, ?)
       on conflict (digest) do nothing`,
      [chunk.digest, packed.encoding, chunk.bytes.byteLength, stored.stored, stored.encryption]
    );
  }
  for (let offset = 0; offset < all.length; offset += ROWS_PER_STATEMENT) {
    const slice = all.slice(offset, offset + ROWS_PER_STATEMENT);
    const values = slice.map(() => "(?, ?)").join(", ");
    const params = slice.flatMap((chunk) => [traceId, chunk.digest]);
    await sql.run(`insert into client_gateway_trace_chunk_uses (trace_id, digest) values ${values} on conflict do nothing`, params);
  }
}

/** For each chunk the project already holds, whether its row is sealed. */
async function heldSealing(sql: AutomationStudioSqlExecutor, chunks: readonly GatewayTraceChunk[]): Promise<Map<string, boolean>> {
  const held = new Map<string, boolean>();
  for (let offset = 0; offset < chunks.length; offset += ROWS_PER_STATEMENT) {
    const slice = chunks.slice(offset, offset + ROWS_PER_STATEMENT);
    const marks = slice.map(() => "?").join(", ");
    const rows = await sql.all<{ digest: Buffer; sealed: number }>(
      `select digest, encryption is not null as sealed from client_gateway_trace_chunks where digest in (${marks})`,
      slice.map((chunk) => chunk.digest)
    );
    for (const row of rows) held.set(row.digest.toString("hex"), row.sealed === 1);
  }
  return held;
}
