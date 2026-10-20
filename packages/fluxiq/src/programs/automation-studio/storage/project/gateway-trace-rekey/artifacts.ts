// The artifact pass (t745 design note D4 step 3): every artifact row whose
// digest is plain (no key) or under a retired key has its bytes read through
// the content store and checked against the old digest in its own form, and
// then gets the keyed digest under the current key. An artifact whose object
// is unsealed (written by a store without protection) is also stored sealed
// first, under its trace's artifact reference, and the row is repointed to the
// sealed object in the same guarded update; the trace's reference to the old
// object is dropped when no artifact row of the trace still names it, and the
// old object is released in the same transaction if nothing references it (its
// row deleted, its file pending removal) and its file removed after commit. A
// batch that changed anything also requests a scrub of the database file.
//
// A crash between the sealed put and the update resumes: the row is still in
// its old form, and the next put of the same bytes dedupes onto the sealed
// object by its content address. When another writer changed the row in
// between, the update does nothing and the new sealed object's reference is
// dropped again. A row whose object is missing or does not verify is counted
// and left as it is; it still fails (or reads as missing) exactly as before.
import { gatewayTraceArtifactRowDigest } from "../gateway-trace/keyed-digests.ts";
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioProjectObjectRepository } from "../object-repository.ts";
import type { GatewayTraceRekeyContext, GatewayTraceRekeySkip } from "./context.ts";
import { gatewayTraceOldFormFilters } from "./old-forms.ts";
import { drainReleasedGatewayTraceObjects } from "./release-object.ts";

const OWNER_KIND = "client_gateway_trace";
/** The media type a store writes artifact objects under, so a sealed copy dedupes with a later write of the same bytes. */
const ARTIFACT_MEDIA_TYPE = "application/octet-stream";

export type GatewayTraceArtifactRekeyResult = {
  /** Rows whose digest is now keyed under the current key. */
  rekeyed: number;
  /** Of those, rows repointed from an unsealed object to a sealed copy. */
  sealed: number;
  skipped: number;
  /** Unsealed artifact objects removed after their last reference went. */
  objectsRemoved: number;
};

type ArtifactRow = { trace_id: string; artifact_id: string; object_id: string; sha256: string; digest_key_id: string | null; byte_length: number };
type Rewrite = { row: ArtifactRow; digest: string; objectId: string };
type Outcome = { rewrite: Rewrite } | { skipped: string };

export async function rekeyGatewayTraceArtifacts(context: GatewayTraceRekeyContext, skips: GatewayTraceRekeySkip[]): Promise<GatewayTraceArtifactRekeyResult> {
  const result: GatewayTraceArtifactRekeyResult = { rekeyed: 0, sealed: 0, skipped: 0, objectsRemoved: 0 };
  for (const filter of gatewayTraceOldFormFilters(context, "digest_key_id")) {
    let cursor: readonly [string, string] = ["", ""];
    for (;;) {
      const rows = await context.database.all<ArtifactRow>(
        `select trace_id, artifact_id, object_id, sha256, digest_key_id, byte_length from client_gateway_trace_artifacts
         where ${filter.where} and (trace_id, artifact_id) > (?, ?)
         order by trace_id, artifact_id limit ?`,
        [...filter.params, cursor[0], cursor[1], context.budget.batchSize]
      );
      if (rows.length === 0) break;
      if (!context.budget.take()) return result;
      const last = rows[rows.length - 1]!;
      cursor = [last.trace_id, last.artifact_id];
      await rekeyBatch(context, rows, result, skips);
      if (rows.length < context.budget.batchSize) break;
    }
  }
  return result;
}

async function rekeyBatch(context: GatewayTraceRekeyContext, rows: readonly ArtifactRow[], result: GatewayTraceArtifactRekeyResult, skips: GatewayTraceRekeySkip[]): Promise<void> {
  const rewrites: Rewrite[] = [];
  for (const row of rows) {
    const outcome = await rowOutcome(context, row);
    if ("rewrite" in outcome) {
      rewrites.push(outcome.rewrite);
      continue;
    }
    result.skipped += 1;
    skips.push({ kind: "artifact", where: `${row.artifact_id} of trace ${row.trace_id}`, reason: outcome.skipped });
  }
  if (rewrites.length === 0) return;
  const written = await context.database.transaction((sql) => writeBatch(sql, context, rewrites));
  result.rekeyed += written.changed.length;
  result.sealed += written.changed.filter((rewrite) => rewrite.objectId !== rewrite.row.object_id).length;
  for (const rewrite of rewrites) {
    if (written.changed.includes(rewrite)) continue;
    result.skipped += 1;
    skips.push({ kind: "artifact", where: `${rewrite.row.artifact_id} of trace ${rewrite.row.trace_id}`, reason: "another writer changed it" });
  }
  result.objectsRemoved += await drainReleasedGatewayTraceObjects(context, written.released, "an unsealed artifact object", skips);
}

async function rowOutcome(context: GatewayTraceRekeyContext, row: ArtifactRow): Promise<Outcome> {
  const object = await context.database.get<{ encryption: string | null }>("select encryption from objects where object_id = ?", [row.object_id]);
  if (object === undefined) return { skipped: "its content object is not held" };
  let bytes: Buffer;
  try {
    bytes = (await context.content.readBytesByObjectId(row.object_id)).content;
  } catch {
    return { skipped: "its content object cannot be read" };
  }
  const { keyring } = context.sealing;
  if (bytes.byteLength !== row.byte_length || !oldDigestMatches(context, row, bytes)) return { skipped: "its bytes do not match its digest" };
  const digest = gatewayTraceArtifactRowDigest({ keyring, keyId: keyring.currentKeyId, bytes, traceId: row.trace_id, artifactId: row.artifact_id });
  if (object.encryption !== null) return { rewrite: { row, digest, objectId: row.object_id } };
  const sealed = await context.content.putBytes({
    content: bytes,
    mediaType: ARTIFACT_MEDIA_TYPE,
    extension: "bin",
    owner: { ownerKind: OWNER_KIND, ownerId: row.trace_id, purpose: "artifact" },
    protect: true
  });
  return { rewrite: { row, digest, objectId: sealed.object.objectId } };
}

/** Whether the bytes give the row's old digest in its form; a form the keyring cannot verify does not match. */
function oldDigestMatches(context: GatewayTraceRekeyContext, row: ArtifactRow, bytes: Uint8Array): boolean {
  try {
    return gatewayTraceArtifactRowDigest({ keyring: context.sealing.keyring, keyId: row.digest_key_id, bytes, traceId: row.trace_id, artifactId: row.artifact_id }) === row.sha256;
  } catch {
    return false;
  }
}

async function writeBatch(sql: AutomationStudioSqlExecutor, context: GatewayTraceRekeyContext, rewrites: readonly Rewrite[]): Promise<{ changed: Rewrite[]; released: string[] }> {
  const keyId = context.sealing.keyring.currentKeyId;
  const now = Date.now();
  const changed: Rewrite[] = [];
  const released: string[] = [];
  for (const rewrite of rewrites) {
    const { row } = rewrite;
    const outcome = await sql.run(
      `update client_gateway_trace_artifacts set sha256 = ?, digest_key_id = ?, object_id = ?
       where trace_id = ? and artifact_id = ? and sha256 = ? and digest_key_id is ? and object_id = ?`,
      [rewrite.digest, keyId, rewrite.objectId, row.trace_id, row.artifact_id, row.sha256, row.digest_key_id, row.object_id]
    );
    if (outcome.changes === 1) changed.push(rewrite);
    if (rewrite.objectId === row.object_id) continue;
    // The object this trace no longer names: the old one when the row moved, the new sealed copy when it did not.
    const unused = outcome.changes === 1 ? row.object_id : rewrite.objectId;
    await sql.run(
      `delete from object_references
       where owner_kind = ? and owner_id = ? and purpose = 'artifact' and object_id = ?
         and not exists (select 1 from client_gateway_trace_artifacts where trace_id = ? and object_id = ?)`,
      [OWNER_KIND, row.trace_id, unused, row.trace_id, unused]
    );
    if (released.includes(unused)) continue;
    if (await AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, unused, now)) released.push(unused);
  }
  if (changed.length > 0 || released.length > 0) await requestContentAddressScrub(sql, now);
  return { changed, released };
}
