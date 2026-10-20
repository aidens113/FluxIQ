// A trace's manifest row (t745 design note D2). A manifest carries the plain
// SHA-256 of every captured artifact (the wire contract), so a store with a
// content protection seals its JSON (under the manifest media type, which the
// protection binds into the sealed form) and keeps "fluxiq-sealed:" + base64 of
// the sealed bytes, with the envelope in `manifest_encryption`: code from
// before t745 fails `JSON.parse` on it, closed. A store without protection
// writes plaintext and clears the envelope. The indexed columns stay plain.
//
// Reads accept either form: no envelope is plaintext JSON; an envelope is opened
// with the store's protection. A sealed row read without the protection, an
// envelope over text that is not sealed, or sealed text with no envelope throws:
// a manifest is never returned half-read or guessed at. Messages name the trace.
import { cloneClientGatewayTraceJson } from "../../../../../client-gateway/trace/index.ts";
import type { ClientGatewayTraceManifest } from "../../../../../client-gateway/trace/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import type { GatewayTraceChunkSealing } from "./types.ts";

export const GATEWAY_TRACE_MANIFEST_MEDIA_TYPE = "application/vnd.fluxiq.client-gateway-trace-manifest+json";

/** What a sealed manifest's `manifest_json` starts with: not JSON, so a reader that does not know the form fails to parse it. */
export const GATEWAY_TRACE_SEALED_MANIFEST_PREFIX = "fluxiq-sealed:";

/** A manifest row as the store selects it. */
export type GatewayTraceManifestRow = { trace_id: string; manifest_json: string; manifest_encryption: string | null };

export async function writeGatewayTraceManifestRow(sql: AutomationStudioSqlExecutor, sealing: GatewayTraceChunkSealing, manifest: ClientGatewayTraceManifest): Promise<void> {
  const json = JSON.stringify(manifest);
  let stored = json;
  let encryption: string | null = null;
  if (sealing.protection !== undefined) {
    const sealed = await sealing.protection.seal({ projectId: sealing.projectId, mediaType: GATEWAY_TRACE_MANIFEST_MEDIA_TYPE, content: Buffer.from(json, "utf8") });
    if (typeof sealed.encryption !== "string" || !sealed.encryption) throw new Error(`manifest of trace ${manifest.traceId} could not be sealed: the protection gave no seal`);
    stored = `${GATEWAY_TRACE_SEALED_MANIFEST_PREFIX}${Buffer.from(sealed.content).toString("base64")}`;
    encryption = sealed.encryption;
  }
  await sql.run(
    `insert into client_gateway_traces
       (trace_id, episode_id, activity, origin_kind, started_at, closed_at, claimed_completeness, manifest_json, manifest_encryption)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (trace_id) do update set
       episode_id = excluded.episode_id,
       activity = excluded.activity,
       origin_kind = excluded.origin_kind,
       started_at = excluded.started_at,
       closed_at = excluded.closed_at,
       claimed_completeness = excluded.claimed_completeness,
       manifest_json = excluded.manifest_json,
       manifest_encryption = excluded.manifest_encryption`,
    [manifest.traceId, manifest.episodeId, manifest.activity, manifest.origin.kind, manifest.startedAt, manifest.closedAt, manifest.completeness.status, stored, encryption]
  );
}

/**
 * The row's manifest, deep-frozen. The seal binds the project and media type,
 * not the trace, so a manifest that names another trace (a sealed row copied
 * onto this one) throws rather than answering for this trace.
 */
export async function readGatewayTraceManifestRow(sealing: GatewayTraceChunkSealing, row: GatewayTraceManifestRow): Promise<ClientGatewayTraceManifest> {
  const json = await manifestText(sealing, row);
  const manifest = cloneClientGatewayTraceJson(JSON.parse(json)) as unknown as ClientGatewayTraceManifest;
  if (manifest.traceId !== row.trace_id) throw new Error(`manifest row of trace ${row.trace_id} holds the manifest of another trace`);
  return manifest;
}

async function manifestText(sealing: GatewayTraceChunkSealing, row: GatewayTraceManifestRow): Promise<string> {
  const sealedText = row.manifest_json.startsWith(GATEWAY_TRACE_SEALED_MANIFEST_PREFIX);
  if (row.manifest_encryption === null) {
    if (sealedText) throw new Error(`manifest of trace ${row.trace_id} is sealed but its row keeps no envelope`);
    return row.manifest_json;
  }
  if (!sealedText) throw new Error(`manifest of trace ${row.trace_id} has an envelope but is not sealed`);
  if (sealing.protection === undefined) {
    throw new Error(`manifest of trace ${row.trace_id} is sealed and cannot be opened without the project's content protection`);
  }
  const sealed = Buffer.from(row.manifest_json.slice(GATEWAY_TRACE_SEALED_MANIFEST_PREFIX.length), "base64");
  try {
    const opened = await sealing.protection.open({ projectId: sealing.projectId, mediaType: GATEWAY_TRACE_MANIFEST_MEDIA_TYPE, content: sealed, encryption: row.manifest_encryption });
    return opened.toString("utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`manifest of trace ${row.trace_id} could not be opened: ${reason}`, { cause: error });
  }
}
