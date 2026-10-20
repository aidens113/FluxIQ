// The manifest pass (t745 design note D4 step 3): every manifest row kept as
// plaintext (no envelope) is sealed in the form `manifest-row.ts` reads: the
// row's own JSON text, sealed under the manifest media type, kept as the sealed
// prefix plus base64 with the envelope beside it. The text is read through
// `readGatewayTraceManifestRow` first (it must parse and name this row's trace),
// the sealed form is opened back through it before anything is written, and the
// update is guarded on the plaintext still being there, so a manifest another
// writer replaced in between is left alone. Only the two manifest columns
// change; the indexed columns stay as they are. A manifest that does not parse
// or names another trace is counted and left as it is. A batch that sealed any
// manifest also requests a scrub of the database file, in the same transaction.
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { GATEWAY_TRACE_MANIFEST_MEDIA_TYPE, GATEWAY_TRACE_SEALED_MANIFEST_PREFIX, readGatewayTraceManifestRow } from "../gateway-trace/manifest-row.ts";
import type { GatewayTraceRekeyContext, GatewayTraceRekeySkip } from "./context.ts";

export type GatewayTraceManifestSealResult = { sealed: number; skipped: number };

/** A manifest row as the trace store selects it. */
type GatewayTraceManifestRow = Parameters<typeof readGatewayTraceManifestRow>[1];

type Sealed = { row: GatewayTraceManifestRow; stored: string; encryption: string };

export async function sealGatewayTraceManifests(context: GatewayTraceRekeyContext, skips: GatewayTraceRekeySkip[]): Promise<GatewayTraceManifestSealResult> {
  const result: GatewayTraceManifestSealResult = { sealed: 0, skipped: 0 };
  let cursor = "";
  for (;;) {
    const rows = await context.database.all<GatewayTraceManifestRow>(
      `select trace_id, manifest_json, manifest_encryption from client_gateway_traces
       where manifest_encryption is null and trace_id > ? order by trace_id limit ?`,
      [cursor, context.budget.batchSize]
    );
    if (rows.length === 0) return result;
    if (!context.budget.take()) return result;
    cursor = rows[rows.length - 1]!.trace_id;
    const sealed: Sealed[] = [];
    for (const row of rows) {
      const outcome = await sealRow(context, row);
      if ("stored" in outcome) sealed.push(outcome);
      else {
        result.skipped += 1;
        skips.push({ kind: "manifest", where: `trace ${row.trace_id}`, reason: outcome.skipped });
      }
    }
    const written = sealed.length === 0 ? [] : await context.database.transaction((sql) => writeBatch(sql, sealed));
    result.sealed += written.length;
    for (const item of sealed) {
      if (written.includes(item)) continue;
      result.skipped += 1;
      skips.push({ kind: "manifest", where: `trace ${item.row.trace_id}`, reason: "another writer changed it" });
    }
    if (rows.length < context.budget.batchSize) return result;
  }
}

async function sealRow(context: GatewayTraceRekeyContext, row: GatewayTraceManifestRow): Promise<Sealed | { skipped: string }> {
  try {
    await readGatewayTraceManifestRow(context.sealing, row);
  } catch {
    return { skipped: "it does not parse as this trace's manifest" };
  }
  const { protection, projectId } = context.sealing;
  const sealed = await protection.seal({ projectId, mediaType: GATEWAY_TRACE_MANIFEST_MEDIA_TYPE, content: Buffer.from(row.manifest_json, "utf8") });
  if (typeof sealed.encryption !== "string" || !sealed.encryption) throw new Error(`manifest of trace ${row.trace_id} could not be sealed: the protection gave no seal`);
  const stored = `${GATEWAY_TRACE_SEALED_MANIFEST_PREFIX}${Buffer.from(sealed.content).toString("base64")}`;
  const reread = await readGatewayTraceManifestRow(context.sealing, { trace_id: row.trace_id, manifest_json: stored, manifest_encryption: sealed.encryption });
  if (reread.traceId !== row.trace_id) throw new Error(`manifest of trace ${row.trace_id} did not open back to its own trace`);
  return { row, stored, encryption: sealed.encryption };
}

async function writeBatch(sql: AutomationStudioSqlExecutor, sealed: readonly Sealed[]): Promise<Sealed[]> {
  const written: Sealed[] = [];
  for (const item of sealed) {
    const outcome = await sql.run(
      "update client_gateway_traces set manifest_json = ?, manifest_encryption = ? where trace_id = ? and manifest_json = ? and manifest_encryption is null",
      [item.stored, item.encryption, item.row.trace_id, item.row.manifest_json]
    );
    if (outcome.changes === 1) written.push(item);
  }
  if (written.length > 0) await requestContentAddressScrub(sql, Date.now());
  return written;
}
