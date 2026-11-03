// The trace manifest pass (t747 design note b): every sealed manifest row
// under a retiring key is opened and its exact JSON text sealed again in the
// form `../gateway-trace/manifest-row.ts` reads (the sealed prefix plus base64,
// the envelope beside it). Only the two manifest columns change; the indexed
// columns stay. A row whose text is not in the sealed form is unreadable.
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { GATEWAY_TRACE_MANIFEST_MEDIA_TYPE, GATEWAY_TRACE_SEALED_MANIFEST_PREFIX } from "../gateway-trace/index.ts";
import type { ContentResealContext, ContentResealPassResult } from "./context.ts";
import { resealSealedRows } from "./row-pass.ts";
import type { ContentResealRowSpec } from "./row-pass.ts";

type ManifestRow = { trace_id: string; manifest_json: string; manifest_encryption: string };

const MANIFEST_SPEC: ContentResealRowSpec<ManifestRow> = {
  kind: "manifest",
  mediaType: GATEWAY_TRACE_MANIFEST_MEDIA_TYPE,
  page: (database: AutomationStudioProjectDatabase, after: ManifestRow | null, limit: number) => database.all<ManifestRow>(
    `select trace_id, manifest_json, manifest_encryption from client_gateway_traces
     where manifest_encryption is not null and trace_id > ? order by trace_id limit ?`,
    [after?.trace_id ?? "", limit]
  ),
  id: (row) => row.trace_id,
  sealedForm: (row) => {
    if (!row.manifest_json.startsWith(GATEWAY_TRACE_SEALED_MANIFEST_PREFIX)) throw new Error(`manifest of trace ${row.trace_id} has an envelope but is not sealed`);
    return { content: Buffer.from(row.manifest_json.slice(GATEWAY_TRACE_SEALED_MANIFEST_PREFIX.length), "base64"), encryption: row.manifest_encryption };
  },
  write: async (sql, row, fresh) => {
    const stored = `${GATEWAY_TRACE_SEALED_MANIFEST_PREFIX}${fresh.content.toString("base64")}`;
    const result = await sql.run(
      "update client_gateway_traces set manifest_json = ?, manifest_encryption = ? where trace_id = ? and manifest_json = ? and manifest_encryption = ?",
      [stored, fresh.encryption, row.trace_id, row.manifest_json, row.manifest_encryption]
    );
    return result.changes === 1;
  }
};

export function resealGatewayTraceManifestRows(context: ContentResealContext): Promise<ContentResealPassResult> {
  return resealSealedRows(context, MANIFEST_SPEC);
}
