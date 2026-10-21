// Drops a trace's claim on its chunks and frees each chunk no other trace
// uses. Runs inside the trace deletion's transaction: the chunks are freed in
// the same step as the rows that named them, and a chunk another trace shares
// stays.
import type { AutomationStudioSqlExecutor } from "../database.ts";

export async function deleteGatewayTraceChunkUses(sql: AutomationStudioSqlExecutor, traceId: string): Promise<void> {
  await sql.run(
    `delete from client_gateway_trace_chunks
     where digest in (select digest from client_gateway_trace_chunk_uses where trace_id = ?)
       and not exists (
         select 1 from client_gateway_trace_chunk_uses other
         where other.digest = client_gateway_trace_chunks.digest and other.trace_id <> ?
       )`,
    [traceId, traceId]
  );
  await sql.run("delete from client_gateway_trace_chunk_uses where trace_id = ?", [traceId]);
}
