import path from "node:path";
import { AutomationStudioProjectDatabase, type AutomationStudioSqlExecutor } from "../project/database-owner/index.ts";
import { AutomationStudioAuthorityGuardRecords as Records, type AuthorityGuardLegacyRequest } from "../project/authority-guard/index.ts";
import type { CanonicalWholeCapability, CanonicalWholeSqlCapability } from "./contracts.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";
import { CanonicalAuthorityWholeOperation } from "./whole-operation.ts";

type EffectKind = "sql_flow_metadata" | "project_change_feed";
type Entry = { owner: CanonicalAuthorityWholeSql; kind: EffectKind; entityId: string; inputDigest: string; state: "ready" | "executing" | "recorded" };
type Parent = { projectId: string; databasePath: string; operationKey: string; requestDigest: string; claimDigest: string; projectRequest: AuthorityGuardLegacyRequest };
const capabilities = new WeakMap<object, Entry>();

/** One-use SQL effect privilege from an actual live parent; no callback-shaped admission. */
export class CanonicalAuthorityWholeSql {
  private readonly issued = new Map<EffectKind, Entry>();
  static readonly schema = "create table if not exists canonical_whole_effect_receipts (operation_key text not null,effect_kind text not null,receipt_json text not null,primary key(operation_key,effect_kind))";
  private constructor(private readonly admission: CanonicalWholeCapability, private readonly parent: Parent) {
    V.closed(parent, ["projectId", "databasePath", "operationKey", "requestDigest", "claimDigest", "projectRequest"]);
    V.id(parent.projectId); V.id(parent.operationKey); V.hash(parent.requestDigest); V.hash(parent.claimDigest);
    if (!path.isAbsolute(parent.databasePath)) throw new Error("canonical_whole.sql_database"); this.parent = V.clone(parent);
  }
  static fromAdmission(capability: CanonicalWholeCapability): CanonicalAuthorityWholeSql {
    return new CanonicalAuthorityWholeSql(capability, CanonicalAuthorityWholeOperation.liveSqlParent(capability));
  }
  issue(kind: EffectKind, entityId: string, input: unknown): CanonicalWholeSqlCapability {
    if (!["sql_flow_metadata", "project_change_feed"].includes(kind)) throw new Error("canonical_whole.sql_kind");
    if (this.issued.has(kind)) throw new Error("canonical_whole.sql_effect_already_issued");
    V.id(entityId); const capability = Object.freeze({}) as CanonicalWholeSqlCapability;
    const inputDigest = V.digest(input), entry: Entry = { owner: this, kind, entityId, inputDigest, state: "ready" }; this.issued.set(kind, entry);
    capabilities.set(capability, entry); return capability;
  }
  static async validate(capability: CanonicalWholeSqlCapability | undefined, database: AutomationStudioProjectDatabase, sql: AutomationStudioSqlExecutor, kind: EffectKind, entityId: string, input: unknown): Promise<void> {
    if (!capability) {
      if (await sql.get("select name from sqlite_master where type='table' and name='canonical_whole_effect_receipts'")) throw new Error("canonical_whole.sql_capability_required");
      return;
    }
    const entry = capabilities.get(capability); if (!entry || entry.state !== "ready" || entry.kind !== kind || entry.entityId !== entityId || entry.inputDigest !== V.digest(input)) throw new Error("canonical_whole.sql_capability");
    entry.state = "executing"; await entry.owner.validateParent(database, sql);
  }
  static async receipt(capability: CanonicalWholeSqlCapability | undefined, database: AutomationStudioProjectDatabase, sql: AutomationStudioSqlExecutor, result: unknown): Promise<void> {
    if (!capability) return;
    const entry = capabilities.get(capability); if (!entry || entry.state !== "executing") throw new Error("canonical_whole.sql_capability");
    await entry.owner.validateParent(database, sql);
    const base = { wholeProtocol: "fluxiq.canonical-whole.v1", operationKey: entry.owner.parent.operationKey, projectId: entry.owner.parent.projectId, projectClaimDigest: entry.owner.parent.claimDigest, requestDigest: entry.owner.parent.requestDigest, effectKind: entry.kind, entityId: entry.entityId, inputDigest: entry.inputDigest, actualDigest: V.digest(result), effectedAt: Date.now() };
    const receipt = { ...base, receiptDigest: V.digest(base) }, text = JSON.stringify(receipt);
    if (Buffer.byteLength(text) > 8192) throw new Error("canonical_whole.sql_receipt_size");
    await sql.run("insert into canonical_whole_effect_receipts values(?,?,?)", [base.operationKey, entry.kind, text]); entry.state = "recorded";
  }
  async read(database: AutomationStudioProjectDatabase, kind: EffectKind): Promise<{ actualDigest: string; entityId: string; effectedAt: number; receiptDigest: string } | null> {
    return database.transaction(async sql => {
      await this.validateParent(database, sql);
      const row = await sql.get<{ receipt_json: string | null }>("select case when length(cast(receipt_json as blob))<=8192 then receipt_json else null end as receipt_json from canonical_whole_effect_receipts where operation_key=? and effect_kind=?", [this.parent.operationKey, kind]);
      if (!row) return null; if (row.receipt_json === null) throw new Error("canonical_whole.sql_receipt_size");
      const receipt = JSON.parse(row.receipt_json) as Record<string, unknown>;
      V.closed(receipt, ["wholeProtocol", "operationKey", "projectId", "projectClaimDigest", "requestDigest", "effectKind", "entityId", "inputDigest", "actualDigest", "effectedAt", "receiptDigest"]);
      if (receipt.wholeProtocol !== "fluxiq.canonical-whole.v1" || receipt.operationKey !== this.parent.operationKey || receipt.projectId !== this.parent.projectId || receipt.projectClaimDigest !== this.parent.claimDigest || receipt.requestDigest !== this.parent.requestDigest || receipt.effectKind !== kind) throw new Error("canonical_whole.sql_receipt");
      V.hash(receipt.inputDigest); V.hash(receipt.actualDigest); V.hash(receipt.receiptDigest); V.id(receipt.entityId); V.integer(receipt.effectedAt);
      const entry = this.issued.get(kind);
      if (!entry || entry.state !== "recorded" || receipt.entityId !== entry.entityId || receipt.inputDigest !== entry.inputDigest) throw new Error("canonical_whole.sql_receipt");
      const { receiptDigest, ...base } = receipt; if (V.digest(base) !== receiptDigest) throw new Error("canonical_whole.sql_receipt");
      return { actualDigest: receipt.actualDigest, entityId: receipt.entityId, effectedAt: receipt.effectedAt, receiptDigest };
    });
  }
  private async validateParent(database: AutomationStudioProjectDatabase, sql: AutomationStudioSqlExecutor): Promise<void> {
    if (V.digest(CanonicalAuthorityWholeOperation.liveSqlParent(this.admission)) !== V.digest(this.parent)) throw new Error("canonical_whole.sql_parent");
    if (!(database instanceof AutomationStudioProjectDatabase) || database.projectId !== this.parent.projectId || path.resolve(database.filePath) !== path.resolve(this.parent.databasePath)) throw new Error("canonical_whole.sql_database");
    await this.preflight(sql);
    const records = new Records(this.parent.projectId, sql), record = await records.legacy(this.parent.projectRequest), state = await records.state();
    if (!record || record.state !== "pending" || record.claimDigest !== this.parent.claimDigest || !state || state.mode !== "legacy" || state.activeCaptureKey !== null || state.completedRevision !== this.parent.projectRequest.expectedRevision) throw new Error("canonical_whole.sql_parent_closed");
  }
  private async preflight(sql: AutomationStudioSqlExecutor): Promise<void> {
    // Closed physical columns only: SQLite counts bytes before any Guard record is materialized.
    const plans: Array<{ table: string; where: string; limit: number; fields: Array<[string, number]> }> = [
      { table: "authority_guard_projects", where: "1=1", limit: 1, fields: [["project_id",200],["mode",16],["last_operation_key",160],["capture_key",160]] },
      { table: "authority_guard_legacy", where: "1=1", limit: 4096, fields: [["operation_key",160],["project_id",200],["predecessor_key",160],["request_json",8192],["claim_json",8192],["unknown_json",8192],["completion_json",8192]] },
      { table: "authority_guard_captures", where: "1=1", limit: 4096, fields: [["capture_key",160],["project_id",200],["request_json",8192],["capture_json",8192],["unknown_json",8192],["release_json",8192]] },
      { table: "mutation_records", where: "mutation_id glob 'authority_guard:*'", limit: 24576, fields: [["mutation_id",256],["operation_kind",200],["owner_kind",200],["owner_id",200],["request_digest",71],["status",16],["response_json",8192],["error_json",8192]] }
    ];
    let total = 0, history = 0;
    for (const plan of plans) {
      const size = plan.fields.map(([field]) => `coalesce(length(cast(${field} as blob)),0)`).join("+"), bad = plan.fields.map(([field, limit]) => `((${field} is not null and typeof(${field})!='text') or length(cast(${field} as blob))>${limit})`).join(" or ");
      const row = await sql.get<{ n: number; bytes: number; bad: number }>(`select count(*) as n,coalesce(sum(${size}),0) as bytes,coalesce(sum(case when ${bad} then 1 else 0 end),0) as bad from ${plan.table} where ${plan.where}`);
      if (!row || !Number.isSafeInteger(row.n) || !Number.isSafeInteger(row.bytes) || row.n < 0 || row.bytes < 0 || row.n > plan.limit || row.bad !== 0) throw new Error("canonical_whole.sql_parent_bounds");
      total += row.bytes; if (plan.table === "authority_guard_legacy" || plan.table === "authority_guard_captures") history += row.n;
      if (total > 8 * 1024 * 1024 || history > 4096) throw new Error("canonical_whole.sql_parent_bounds");
    }
  }
}
