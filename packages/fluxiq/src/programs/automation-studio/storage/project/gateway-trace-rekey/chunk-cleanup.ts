// The cleanup after the event pass (t745 design note D4 step 3, D5): chunk rows
// in an old form (no key, or a retired key) and their uses are deleted unless an
// event row still in an old chunked form names them. One transaction, which
// reads the old-form events itself, so the check and the deletion see the same
// rows: a chunk an unconverted event (a damaged one, say) still needs stays,
// with the use of each trace whose old-form event names it, and that event
// still reads or fails exactly as before. Nothing is deleted before the keyed
// replacement committed, since the event pass converts a row and writes its
// keyed chunks in one transaction. When it deleted anything it also requests a
// scrub of the database file, in the same transaction.
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import type { GatewayTraceRekeyContext } from "./context.ts";
import { gatewayTraceOldFormFilters } from "./old-forms.ts";

const DIGEST_BYTES = 32;

export type GatewayTraceChunkCleanupResult = { chunksDeleted: number; usesDeleted: number };

export async function deleteOldFormGatewayTraceChunks(context: GatewayTraceRekeyContext): Promise<GatewayTraceChunkCleanupResult> {
  return context.database.transaction(async (sql) => {
    const named = await namedByOldFormEvents(sql, context);
    const result: GatewayTraceChunkCleanupResult = { chunksDeleted: 0, usesDeleted: 0 };
    for (const filter of gatewayTraceOldFormFilters(context, "address_key_id")) {
      const chunks = await sql.all<{ digest: Buffer }>(`select digest from client_gateway_trace_chunks where ${filter.where} order by digest`, filter.params);
      for (const { digest } of chunks) {
        const name = digest.toString("hex");
        const traces = named.get(name);
        if (traces === undefined) {
          result.usesDeleted += (await sql.run("delete from client_gateway_trace_chunk_uses where digest = ?", [digest])).changes;
          result.chunksDeleted += (await sql.run("delete from client_gateway_trace_chunks where digest = ?", [digest])).changes;
          continue;
        }
        const uses = await sql.all<{ trace_id: string }>("select trace_id from client_gateway_trace_chunk_uses where digest = ?", [digest]);
        for (const use of uses) {
          if (traces.has(use.trace_id)) continue;
          result.usesDeleted += (await sql.run("delete from client_gateway_trace_chunk_uses where trace_id = ? and digest = ?", [use.trace_id, digest])).changes;
        }
      }
    }
    if (result.chunksDeleted + result.usesDeleted > 0) await requestContentAddressScrub(sql, Date.now());
    return result;
  });
}

/** For each chunk an old-form chunked event names (by hex digest), the traces whose events name it. */
async function namedByOldFormEvents(sql: AutomationStudioSqlExecutor, context: GatewayTraceRekeyContext): Promise<Map<string, Set<string>>> {
  const named = new Map<string, Set<string>>();
  for (const filter of gatewayTraceOldFormFilters(context, "event_chunk_address_key_id")) {
    const rows = await sql.all<{ trace_id: string; digests: Buffer }>(
      `select trace_id, event_chunk_digests as digests from client_gateway_trace_events where ${filter.where} and event_chunk_digests is not null`,
      filter.params
    );
    for (const row of rows) {
      for (let offset = 0; offset + DIGEST_BYTES <= row.digests.byteLength; offset += DIGEST_BYTES) {
        const name = row.digests.subarray(offset, offset + DIGEST_BYTES).toString("hex");
        const traces = named.get(name) ?? new Set<string>();
        traces.add(row.trace_id);
        named.set(name, traces);
      }
    }
  }
  return named;
}
