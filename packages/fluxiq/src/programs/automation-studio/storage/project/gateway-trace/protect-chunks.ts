// Seals every chunk the project holds unsealed: those 0031 wrote before chunks
// were protected, and those a store without protection wrote since. A store
// opened with a content protection runs this as it opens (see
// `chunk-protection-migration.ts` for why a migration cannot). Each row's
// stored bytes are sealed as they are, with their encoding kept: nothing is
// decoded here, so a damaged chunk stays damaged and still fails when read.
// The partial index on unsealed rows keeps the check cheap once none are left.
// A protected store runs it as the rekey's last pass, before the scrub (t745):
// a batch that sealed rows in place requests one in its own transaction.
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { sealGatewayTraceChunk } from "./seal-chunk.ts";
import type { GatewayTraceChunkSealing } from "./types.ts";

const ROWS_PER_BATCH = 200;

type UnsealedRow = { digest: Buffer; stored: Buffer };

/** How many chunks were sealed; none without a protection. */
export async function protectGatewayTraceChunks(database: AutomationStudioProjectDatabase, sealing: GatewayTraceChunkSealing): Promise<number> {
  if (sealing.protection === undefined) return 0;
  let total = 0;
  for (;;) {
    const rows = await database.all<UnsealedRow>(
      "select digest, stored from client_gateway_trace_chunks where encryption is null order by digest limit ?",
      [ROWS_PER_BATCH]
    );
    if (rows.length === 0) return total;
    const sealed: Array<{ digest: Buffer; stored: Buffer; encryption: string | null }> = [];
    for (const row of rows) {
      const result = await sealGatewayTraceChunk(sealing, row.stored);
      if (result.encryption === null) throw new Error(`gateway trace chunk ${row.digest.toString("hex")} could not be sealed: the protection gave no seal`);
      sealed.push({ digest: row.digest, stored: result.stored, encryption: result.encryption });
    }
    const changed = await database.transaction(async (sql) => {
      let count = 0;
      for (const row of sealed) {
        const result = await sql.run(
          "update client_gateway_trace_chunks set stored = ?, encryption = ? where digest = ? and encryption is null",
          [row.stored, row.encryption, row.digest]
        );
        count += result.changes;
      }
      // The rows' plaintext may survive in rebuilt pages' free gaps: ask for a scrub with the change (t745).
      if (count > 0) await requestContentAddressScrub(sql, Date.now());
      return count;
    });
    if (changed === 0) throw new Error("gateway trace chunks could not be sealed: no unsealed row changed");
    total += changed;
  }
}
