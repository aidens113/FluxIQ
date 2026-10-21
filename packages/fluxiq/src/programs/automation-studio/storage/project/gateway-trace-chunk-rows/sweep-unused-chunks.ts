// The retention sweep's share of gateway traces (lane T P3-E): frees the chunks
// no trace uses, as the content sweep frees objects nothing references. A
// trace deletion already frees its own unshared chunks in its transaction;
// this catches the rest: chunk uses left by a trace whose events are gone, and
// chunks no use names. One transaction, so a trace appending its chunks and
// their uses is seen whole or not at all. A project whose database never held a
// trace has no chunk table, and so no chunks to free.
import type { AutomationStudioProjectDatabase } from "../database.ts";

const DIGESTS_PER_STATEMENT = 400;

/** The freed chunks' ids (`gateway-trace-chunk:<sha256 hex>`), at most `limit`. */
export async function sweepUnusedGatewayTraceChunks(database: AutomationStudioProjectDatabase, input: { limit: number }): Promise<readonly string[]> {
  const limit = Math.max(1, Math.trunc(input.limit));
  return database.transaction(async (sql) => {
    const table = await sql.get<{ present: number }>(
      "select count(*) as present from sqlite_master where type = 'table' and name = 'client_gateway_trace_chunks'"
    );
    if (table === undefined) throw new Error("the project database could not say whether it holds gateway trace chunks");
    if (Number(table.present) === 0) return [];
    await sql.run(
      `delete from client_gateway_trace_chunk_uses
       where not exists (select 1 from client_gateway_trace_events e where e.trace_id = client_gateway_trace_chunk_uses.trace_id)`
    );
    const unused = await sql.all<{ digest: Buffer }>(
      `select digest from client_gateway_trace_chunks c
       where not exists (select 1 from client_gateway_trace_chunk_uses u where u.digest = c.digest)
       order by digest limit ?`,
      [limit]
    );
    for (let offset = 0; offset < unused.length; offset += DIGESTS_PER_STATEMENT) {
      const slice = unused.slice(offset, offset + DIGESTS_PER_STATEMENT);
      const marks = slice.map(() => "?").join(", ");
      await sql.run(`delete from client_gateway_trace_chunks where digest in (${marks})`, slice.map((row) => row.digest));
    }
    return unused.map((row) => `gateway-trace-chunk:${row.digest.toString("hex")}`);
  });
}
