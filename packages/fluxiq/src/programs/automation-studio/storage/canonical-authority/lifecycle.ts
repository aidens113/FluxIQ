import type { SQLiteTransaction } from "../../../database-manager/storage/sqlite-repository.ts";
import type { CanonicalProjectLifecycle } from "./contracts.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";

/** Original project identity survives deletion of its directory; never seeds legacy rows. */
export class CanonicalAuthorityLifecycle {
  static readonly schema = "create table if not exists canonical_authority_lifecycle (original_project_id text primary key,protocol_version integer not null check(protocol_version=1),status text not null check(status in ('creating','active','deleting','tombstoned')),revision integer not null check(revision>=0),catalogue_digest text not null,pending_operation_key text)";
  async read(sql: SQLiteTransaction, projectId: string): Promise<CanonicalProjectLifecycle | null> {
    V.id(projectId);
    const row = await sql.get<{ protocol_version: number; status: CanonicalProjectLifecycle["status"]; revision: number; catalogue_digest: string; pending_operation_key: string | null }>("select * from canonical_authority_lifecycle where original_project_id=?", [projectId]);
    if (!row) return null;
    if (row.protocol_version !== 1 || !["creating", "active", "deleting", "tombstoned"].includes(row.status)) throw new Error("canonical_whole.lifecycle_protocol");
    V.integer(row.revision); V.hash(row.catalogue_digest); if (row.pending_operation_key !== null) V.id(row.pending_operation_key);
    return Object.freeze({ protocolVersion: 1, originalProjectId: projectId, status: row.status, revision: row.revision, catalogueDigest: row.catalogue_digest, pendingOperationKey: row.pending_operation_key });
  }
  async create(sql: SQLiteTransaction, projectId: string, operationKey: string): Promise<void> {
    V.id(projectId); V.id(operationKey);
    if (await this.read(sql, projectId)) throw new Error("canonical_whole.project_allocated");
    await sql.run("insert into canonical_authority_lifecycle values(?,1,'creating',0,?,?)", [projectId, V.digest(null), operationKey]);
  }
  async admit(sql: SQLiteTransaction, projectId: string, operationKey: string): Promise<CanonicalProjectLifecycle> {
    const state = await this.read(sql, projectId);
    if (!state || state.status !== "active" || state.pendingOperationKey) throw new Error("canonical_whole.lifecycle_unavailable");
    await sql.run("update canonical_authority_lifecycle set pending_operation_key=? where original_project_id=?", [operationKey, projectId]);
    return state;
  }
  async complete(sql: SQLiteTransaction, projectId: string, operationKey: string, baseRevision: number, catalogueDigest: string): Promise<void> {
    const state = await this.read(sql, projectId); V.hash(catalogueDigest);
    if (!state || state.pendingOperationKey !== operationKey || state.revision !== baseRevision || !["creating", "active"].includes(state.status)) throw new Error("canonical_whole.lifecycle_completion");
    await sql.run("update canonical_authority_lifecycle set status='active',revision=revision+1,catalogue_digest=?,pending_operation_key=null where original_project_id=?", [catalogueDigest, projectId]);
  }
}
