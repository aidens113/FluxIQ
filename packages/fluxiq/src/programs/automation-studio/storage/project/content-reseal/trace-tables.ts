// Which sealed trace columns a project holds (t747 design note b). A project
// that never opened a gateway trace store has no trace tables, and one opened
// only before chunk protection (0032) or keyed manifests (0034) has no sealed
// form in them; the re-seal checks before it scans and never migrates them.
import type { AutomationStudioProjectDatabase } from "../database.ts";

export type ContentResealTraceTables = { readonly chunks: boolean; readonly manifests: boolean };

export async function sealedGatewayTraceTables(database: AutomationStudioProjectDatabase): Promise<ContentResealTraceTables> {
  return {
    chunks: await hasColumn(database, "client_gateway_trace_chunks", "encryption"),
    manifests: await hasColumn(database, "client_gateway_traces", "manifest_encryption")
  };
}

async function hasColumn(database: AutomationStudioProjectDatabase, table: string, column: string): Promise<boolean> {
  const row = await database.get<{ found: number }>("select 1 as found from pragma_table_info(?) where name = ?", [table, column]);
  return row !== undefined;
}
