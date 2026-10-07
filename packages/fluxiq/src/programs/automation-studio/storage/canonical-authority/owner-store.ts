import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../core/index.ts";
import { SQLiteRepository, type SQLiteTransaction } from "../../../database-manager/storage/sqlite-repository.ts";
import type { AuthorityGuardCompletion, AuthorityGuardLegacyRequest } from "../project/authority-guard/index.ts";
import { AutomationStudioAuthorityGuardValidation as G } from "../project/authority-guard/index.ts";
import { CANONICAL_AUTHORITY_SCHEMA } from "./migration.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";
import { CanonicalAuthorityProjectExistence } from "./project-existence.ts";
import { canonicalArtifactIdentity, type CanonicalAutomationStudioArtifact } from "../ids.ts";
import type { CanonicalAuthorityCapability, CanonicalAuthorityEffect, CanonicalAuthorityKind, CanonicalAuthorityOperation, CanonicalAuthorityOwner, CanonicalAuthorityRequest, CanonicalAuthorityOptions, CanonicalAuthorityDomainConstraint } from "./contracts.ts";

/** Internal same-global-DB owner. No allocation or SQL port is exported by the public barrel. */
export class CanonicalAuthorityOwnerStore {
  private readonly database: SQLiteRepository;
  private readonly capabilities = new WeakMap<object, CanonicalAuthorityRequest>();
  private readonly creationOptions: CanonicalAuthorityOptions | undefined;
  constructor(rootDir: string, options?: CanonicalAuthorityOptions) { this.database = new SQLiteRepository({ rootDir, kind: "automation.flows", layoutVersion: 2 }); this.creationOptions = options ? V.options(options) : undefined; }
  /** Private owning creation seam; not wired to any real creator or public barrel. */
  private async createFlow(projectId: string, contents: JsonObject) {
    if (!this.creationOptions) throw new Error("canonical_authority.creation_owner_unavailable");
    V.id(projectId); const document = V.clone({ ...V.clone(contents), flowId: randomUUID(), projectId });
    const existence = new CanonicalAuthorityProjectExistence(this.creationOptions.projectRootDir);
    await existence.verify(projectId); await existence.verify(projectId);
    const admitted = await this.reserveOwned("automation.flows", document.flowId, "put", document, { originalProjectId: projectId });
    return { ...admitted, document };
  }
  private async createPublication(flowId: string, contents: JsonObject) {
    if (!this.creationOptions) throw new Error("canonical_authority.creation_owner_unavailable");
    V.id(flowId); const frozen = V.clone(contents); V.id(frozen.version);
    const flowOwner = await this.readOwner("automation.flows", flowId);
    if (!flowOwner || flowOwner.tombstoned || frozen.projectId !== undefined && frozen.projectId !== flowOwner.originalProjectId) throw new Error("canonical_authority.publication_owner");
    const existence = new CanonicalAuthorityProjectExistence(this.creationOptions.projectRootDir);
    await existence.verify(flowOwner.originalProjectId);
    const publicationId = `${flowId}@${frozen.version}`; V.id(publicationId);
    const document = V.clone({ ...frozen, publicationId, flowId, projectId: flowOwner.originalProjectId });
    const admitted = await this.reserveOwned("automation.flow_publications", publicationId, "put", document, { originalProjectId: flowOwner.originalProjectId });
    return { ...admitted, document };
  }
  async installRouting(): Promise<void> {
    await this.database.transaction({}, async sql => {
      for (const statement of CANONICAL_AUTHORITY_SCHEMA) await sql.run(statement);
      const config = await sql.get<{ protocol_version: number; mode: string }>("select * from canonical_authority_config where singleton=1");
      if (config?.protocol_version !== 1 || !["legacy", "routing"].includes(config.mode)) throw new Error("canonical_authority.protocol");
      await sql.run("update canonical_authority_config set mode='routing' where singleton=1");
      await sql.run('create table if not exists "automation.flow_publications" (id text primary key, kind text not null, data text not null, created_at_ms integer not null, updated_at_ms integer not null)');
      await sql.run('create index if not exists "automation.flow_publications_updated_idx" on "automation.flow_publications"(updated_at_ms)');
    });
  }
  async routingRequired(kind: CanonicalAuthorityKind, id: string): Promise<boolean> {
    V.kind(kind);
    return this.database.transaction({}, async sql => {
      const present = await sql.get("select name from sqlite_master where type='table' and name='canonical_authority_config'");
      if (!present) return false;
      const config = await sql.get<{ protocol_version: number; mode: string }>("select * from canonical_authority_config where singleton=1");
      if (!config || config.protocol_version !== 1 || !["legacy", "routing"].includes(config.mode)) throw new Error("canonical_authority.protocol");
      return config.mode === "routing" || Boolean(await this.owner(sql, kind, id));
    });
  }
  /** Legacy mode check and effect share the same lock; opt-in cannot race between them. */
  async tryLegacyMutation(kind: CanonicalAuthorityKind, id: string, method: "put" | "delete", document: JsonObject | null, domainId?: string | null): Promise<boolean | null> {
    V.kind(kind);
    return this.database.transaction({}, async sql => {
      const present = await sql.get("select name from sqlite_master where type='table' and name='canonical_authority_config'");
      if (present) {
        const config = await sql.get<{ protocol_version: number; mode: string }>("select * from canonical_authority_config where singleton=1");
        if (!config || config.protocol_version !== 1 || !["legacy", "routing"].includes(config.mode)) throw new Error("canonical_authority.protocol");
        if (config.mode === "routing" || await this.owner(sql, kind, id)) return null;
      }
      await sql.run(`create table if not exists "${kind}" (id text primary key,kind text not null,data text not null,created_at_ms integer not null,updated_at_ms integer not null)`);
      await sql.run(`create index if not exists "${kind}_updated_idx" on "${kind}"(updated_at_ms)`);
      if (method === "delete") {
        if (domainId !== undefined) {
          const current = await sql.get<{ data: string }>(`select data from "${kind}" where id=?`, [id]);
          if (!current || canonicalArtifactIdentity(JSON.parse(current.data).document as CanonicalAutomationStudioArtifact).domainId !== domainId) return false;
        }
        return (await sql.run(`delete from "${kind}" where id=?`, [id])).changes > 0;
      }
      if (!document) throw new Error("canonical_authority.document");
      const now = Date.now(); await sql.run(`insert into "${kind}" (id,kind,data,created_at_ms,updated_at_ms) values(?,?,?,?,?) on conflict(id) do update set data=excluded.data,updated_at_ms=excluded.updated_at_ms`, [id, kind, JSON.stringify({ document, domainId: domainId ?? null }), now, now]); return true;
    });
  }
  readOwner(kind: CanonicalAuthorityKind, id: string): Promise<CanonicalAuthorityOwner | null> { V.kind(kind); V.id(id); return this.database.transaction({}, sql => this.owner(sql, kind, id)); }
  async reserve(kind: CanonicalAuthorityKind, resourceId: string, method: "put" | "delete", document: JsonObject | null, domainConstraint: CanonicalAuthorityDomainConstraint = { kind: "any" }): Promise<{ capability: CanonicalAuthorityCapability; record: CanonicalAuthorityOperation }> {
    V.kind(kind); V.id(resourceId); const frozen = V.clone(document), constraint = V.constraint(domainConstraint);
    if (method !== "put" && method !== "delete") throw new Error("canonical_authority.method");
    return this.reserveOwned(kind, resourceId, method, frozen, undefined, constraint);
  }
  private async reserveOwned(kind: CanonicalAuthorityKind, resourceId: string, method: "put" | "delete", frozen: JsonObject | null, creation?: { originalProjectId: string }, domainConstraint: CanonicalAuthorityDomainConstraint = { kind: "any" }): Promise<{ capability: CanonicalAuthorityCapability; record: CanonicalAuthorityOperation }> {
    const documentDigest = V.digest(frozen), operationKey = randomUUID();
    const record = await this.database.transaction({}, async sql => {
      const config = await sql.get<{ mode: string; protocol_version: number }>("select * from canonical_authority_config where singleton=1");
      if (config?.mode !== "routing" || config.protocol_version !== 1) throw new Error("canonical_authority.routing_required");
      let owner = await this.owner(sql, kind, resourceId);
      if (owner && creation) throw new Error("canonical_authority.allocated");
      if (!owner && creation) {
        const existing = await sql.get(`select id from "${kind}" where id=?`, [resourceId]);
        if (existing) throw new Error("canonical_authority.unseeded");
        owner = { protocolVersion: 1, kind, resourceId, originalProjectId: creation.originalProjectId, ownerRevision: 0, tombstoned: false };
        await sql.run("insert into canonical_authority_owners values(?,?,?,0,0)", [kind, resourceId, owner.originalProjectId]);
      }
      if (!owner) throw new Error("canonical_authority.unbound");
      if (owner.tombstoned) throw new Error("canonical_authority.tombstoned");
      if (frozen && frozen.projectId !== owner.originalProjectId) throw new Error("canonical_authority.foreign_owner");
      if (frozen && kind === "automation.flows" && frozen.flowId !== resourceId) throw new Error("canonical_authority.flow_identity");
      if (frozen && kind === "automation.flow_publications") {
        V.id(frozen.flowId); V.id(frozen.version);
        if (frozen.publicationId !== resourceId || `${frozen.flowId}@${frozen.version}` !== resourceId) throw new Error("canonical_authority.publication_identity");
        const current = await sql.get<{ publicationId: string; flowId: string; version: string }>(`select json_extract(data,'$.document.publicationId') as publicationId,json_extract(data,'$.document.flowId') as flowId,json_extract(data,'$.document.version') as version from "automation.flow_publications" where id=?`, [resourceId]);
        if (current && (current.publicationId !== frozen.publicationId || current.flowId !== frozen.flowId || current.version !== frozen.version)) throw new Error("canonical_authority.publication_identity");
        const flow = await this.owner(sql, "automation.flows", frozen.flowId);
        if (!flow || flow.tombstoned || flow.originalProjectId !== owner.originalProjectId) throw new Error("canonical_authority.publication_owner");
      }
      await this.allow(sql, owner.originalProjectId);
      const base = { protocolVersion: 1 as const, operationKey, kind, resourceId, method, originalProjectId: owner.originalProjectId, baseOwnerRevision: owner.ownerRevision, domainConstraint, documentDigest };
      const request = { ...base, requestDigest: V.digest(base) }, claimDigest = V.digest(request);
      await sql.run("insert into canonical_authority_operations(operation_key,request_json,claim_digest,original_project_id,phase) values(?,?,?,?,'reserved')", [operationKey, JSON.stringify(request), claimDigest, owner.originalProjectId]);
      return V.clone({ request, claimDigest, phase: "reserved" as const, projectRequest: null, projectClaimDigest: null, effect: null, projectReceipt: null });
    });
    const capability = Object.freeze({}) as CanonicalAuthorityCapability; this.capabilities.set(capability, record.request); return { capability, record };
  }
  async join(capability: CanonicalAuthorityCapability, projectRequest: AuthorityGuardLegacyRequest, projectClaimDigest: string): Promise<void> {
    const request = this.owned(capability); V.hash(projectClaimDigest);
    projectRequest = G.legacy(projectRequest, request.originalProjectId);
    if (projectRequest.projectId !== request.originalProjectId || projectRequest.requestDigest !== request.requestDigest || projectRequest.operationKey !== request.operationKey) throw new Error("canonical_authority.join");
    await this.database.transaction({}, async sql => {
      const record = await this.operation(sql, request.operationKey); this.matches(record, request);
      if (record.phase !== "reserved") throw new Error("canonical_authority.phase");
      await sql.run("update canonical_authority_operations set phase='project_claimed',project_request_json=?,project_claim_digest=? where operation_key=?", [JSON.stringify(projectRequest), projectClaimDigest, request.operationKey]);
    });
  }
  async effect(capability: CanonicalAuthorityCapability, document: JsonObject | null): Promise<CanonicalAuthorityEffect> {
    const request = this.owned(capability), frozen = V.clone(document);
    if (V.digest(frozen) !== request.documentDigest) throw new Error("canonical_authority.document_changed");
    return this.database.transaction({}, async sql => {
      const record = await this.operation(sql, request.operationKey); this.matches(record, request);
      if (record.phase !== "project_claimed") throw new Error("canonical_authority.phase");
      const owner = await this.owner(sql, request.kind, request.resourceId);
      if (!owner || owner.tombstoned || owner.ownerRevision !== request.baseOwnerRevision || owner.originalProjectId !== request.originalProjectId) throw new Error("canonical_authority.owner_conflict");
      const fence = await sql.get<{ mode: string }>("select mode from canonical_authority_project_fences where original_project_id=?", [owner.originalProjectId]);
      if (fence && fence.mode !== "routing") throw new Error("canonical_authority.capturing");
      if (request.method === "delete" && request.domainConstraint.kind === "exact") {
        const scope = request.kind === "automation.flows" ? "$.document.scope" : "$.document.snapshot.scope";
        const current = await sql.get<{ scopeKind: string; domainId: string | null }>(`select json_extract(data,'${scope}.kind') as scopeKind,json_extract(data,'${scope}.domainId') as domainId from "${request.kind}" where id=?`, [request.resourceId]);
        if (!current || (current.scopeKind === "domain" ? current.domainId : null) !== request.domainConstraint.domainId) throw new Error("canonical_authority.domain_scope");
      }
      const changedAt = Date.now(), nextRevision = owner.ownerRevision + 1; V.integer(nextRevision);
      if (request.method === "put") {
        if (!frozen || frozen.projectId !== owner.originalProjectId) throw new Error("canonical_authority.document");
        const domainId = canonicalArtifactIdentity(frozen as unknown as CanonicalAutomationStudioArtifact).domainId ?? null;
        await sql.run(`insert into "${request.kind}" (id,kind,data,created_at_ms,updated_at_ms) values(?,?,?,?,?) on conflict(id) do update set data=excluded.data,updated_at_ms=excluded.updated_at_ms`, [request.resourceId, request.kind, JSON.stringify({ document: frozen, domainId }), changedAt, changedAt]);
      } else await sql.run(`delete from "${request.kind}" where id=?`, [request.resourceId]);
      await sql.run("update canonical_authority_owners set owner_revision=?,tombstoned=? where kind=? and resource_id=?", [nextRevision, request.method === "delete" ? 1 : 0, request.kind, request.resourceId]);
      const base = { protocolVersion: 1 as const, operationKey: request.operationKey, requestDigest: request.requestDigest, claimDigest: record.claimDigest, kind: request.kind, resourceId: request.resourceId, originalProjectId: owner.originalProjectId, previousOwnerRevision: owner.ownerRevision, completedOwnerRevision: nextRevision, documentDigest: request.documentDigest, resultDigest: V.digest({ kind: request.kind, resourceId: request.resourceId, ownerRevision: nextRevision, tombstoned: request.method === "delete", documentDigest: request.documentDigest }), effectedAt: changedAt };
      const effect = { ...base, receiptDigest: V.digest(base) };
      await sql.run("update canonical_authority_operations set phase='effect_applied',effect_json=? where operation_key=?", [JSON.stringify(effect), request.operationKey]);
      await sql.run("update canonical_authority_project_fences set revision=revision+1 where original_project_id=?", [owner.originalProjectId]); return V.clone(effect);
    });
  }
  async finalize(capability: CanonicalAuthorityCapability, projectReceipt: AuthorityGuardCompletion): Promise<void> {
    const request = this.owned(capability), receipt = V.clone(projectReceipt);
    V.closed(receipt, ["projectId", "operationKey", "claimDigest", "ownerKind", "ownerId", "operationKind", "requestDigest", "previousRevision", "completedRevision", "resultDigest", "completedAt", "receiptDigest"]);
    const { receiptDigest, ...receiptBase } = receipt; V.integer(receipt.completedAt);
    if (receiptDigest !== V.digest(receiptBase)) throw new Error("canonical_authority.project_receipt_digest");
    await this.database.transaction({}, async sql => {
      const record = await this.operation(sql, request.operationKey); this.matches(record, request);
      if (record.phase !== "effect_applied" || !record.effect || !record.projectRequest || receipt.projectId !== request.originalProjectId || receipt.operationKey !== request.operationKey || receipt.claimDigest !== record.projectClaimDigest || receipt.requestDigest !== request.requestDigest || receipt.resultDigest !== record.effect.resultDigest || receipt.previousRevision !== record.projectRequest.expectedRevision || receipt.completedRevision !== record.projectRequest.expectedRevision + 1 || receipt.ownerKind !== record.projectRequest.ownerKind || receipt.ownerId !== record.projectRequest.ownerId || receipt.operationKind !== record.projectRequest.operationKind) throw new Error("canonical_authority.project_completion");
      await sql.run("update canonical_authority_operations set phase='completed',project_receipt_json=? where operation_key=?", [JSON.stringify(receipt), request.operationKey]);
    });
  }
  reconcile(operationKey: string): Promise<CanonicalAuthorityOperation> { V.id(operationKey); return this.database.transaction({}, sql => this.operation(sql, operationKey)); }
  describe(capability: CanonicalAuthorityCapability): CanonicalAuthorityRequest { return this.owned(capability); }
  async beginFence(projectId: string, captureKey: string, expectedRevision: number): Promise<{ requestDigest: string; captureDigest: string; revision: number }> {
    V.id(projectId); V.id(captureKey); V.integer(expectedRevision);
    return this.database.transaction({}, async sql => {
      await this.allow(sql, projectId);
      const fence = await sql.get<{ revision: number }>("select revision from canonical_authority_project_fences where original_project_id=?", [projectId]);
      if (fence?.revision !== expectedRevision) throw new Error("canonical_authority.capture_revision");
      const request = { protocolVersion: 1, projectId, captureKey, expectedRevision }, requestDigest = V.digest(request), captureDigest = V.digest({ request, requestDigest });
      await sql.run("insert into canonical_authority_captures(capture_key,original_project_id,request_json,capture_digest,phase) values(?,?,?,?,'global_fenced')", [captureKey, projectId, JSON.stringify(request), captureDigest]);
      await sql.run("update canonical_authority_project_fences set mode='capturing',capture_key=? where original_project_id=?", [captureKey, projectId]);
      return { requestDigest, captureDigest, revision: expectedRevision };
    });
  }
  async bindFence(captureKey: string, projectRequest: JsonObject, projectCaptureDigest: string): Promise<void> {
    V.id(captureKey); V.hash(projectCaptureDigest); const request = V.clone(projectRequest);
    await this.database.transaction({}, async sql => {
      const row = await sql.get<{ original_project_id: string; phase: string }>("select * from canonical_authority_captures where capture_key=?", [captureKey]);
      if (!row || row.phase !== "global_fenced" || request.projectId !== row.original_project_id || request.captureKey !== captureKey) throw new Error("canonical_authority.capture_join");
      await sql.run("update canonical_authority_captures set phase='project_fenced',project_request_json=?,project_capture_digest=? where capture_key=?", [JSON.stringify(request), projectCaptureDigest, captureKey]);
    });
  }
  private async allow(sql: SQLiteTransaction, projectId: string): Promise<void> {
    const unresolved = await sql.get("select operation_key from canonical_authority_operations where original_project_id=? and phase!='completed' limit 1", [projectId]);
    if (unresolved) throw new Error("canonical_authority.unresolved");
    await sql.run("insert or ignore into canonical_authority_project_fences values(?,0,'routing',null)", [projectId]);
    const fence = await sql.get<{ mode: string }>("select mode from canonical_authority_project_fences where original_project_id=?", [projectId]);
    if (fence?.mode !== "routing") throw new Error("canonical_authority.capturing");
  }
  private owned(capability: CanonicalAuthorityCapability): CanonicalAuthorityRequest { const request = this.capabilities.get(capability); if (!request) throw new Error("canonical_authority.capability"); return request; }
  private matches(record: CanonicalAuthorityOperation, request: CanonicalAuthorityRequest): void { if (V.digest(record.request) !== V.digest(request)) throw new Error("canonical_authority.request_conflict"); }
  private async owner(sql: SQLiteTransaction, kind: CanonicalAuthorityKind, id: string): Promise<CanonicalAuthorityOwner | null> {
    const row = await sql.get<{ original_project_id: string; owner_revision: number; tombstoned: number }>("select * from canonical_authority_owners where kind=? and resource_id=?", [kind, id]);
    if (!row) return null; V.id(row.original_project_id); V.integer(row.owner_revision);
    if (row.tombstoned !== 0 && row.tombstoned !== 1) throw new Error("canonical_authority.owner_record");
    return { protocolVersion: 1, kind, resourceId: id, originalProjectId: row.original_project_id, ownerRevision: row.owner_revision, tombstoned: row.tombstoned === 1 };
  }
  private async operation(sql: SQLiteTransaction, operationKey: string): Promise<CanonicalAuthorityOperation> {
    const row = await sql.get<{ request_json: string; claim_digest: string; phase: CanonicalAuthorityOperation["phase"]; project_request_json: string | null; project_claim_digest: string | null; effect_json: string | null; project_receipt_json: string | null }>("select * from canonical_authority_operations where operation_key=?", [operationKey]);
    if (!row || !["reserved", "project_claimed", "effect_applied", "completed", "unknown"].includes(row.phase)) throw new Error("canonical_authority.operation_record");
    const decode = <T>(json: string): T => { if (Buffer.byteLength(json) > 8192) throw new Error("canonical_authority.record_size"); return JSON.parse(json) as T; };
    const request = decode<CanonicalAuthorityRequest>(row.request_json);
    V.closed(request, ["protocolVersion", "operationKey", "kind", "resourceId", "method", "originalProjectId", "baseOwnerRevision", "domainConstraint", "documentDigest", "requestDigest"]); V.constraint(request.domainConstraint);
    const { requestDigest, ...base } = request; V.id(request.operationKey); V.id(request.resourceId); V.id(request.originalProjectId); V.kind(request.kind); V.integer(request.baseOwnerRevision); V.hash(request.documentDigest);
    if (request.protocolVersion !== 1 || request.operationKey !== operationKey || !["put", "delete"].includes(request.method) || requestDigest !== V.digest(base) || row.claim_digest !== V.digest(request)) throw new Error("canonical_authority.request_record");
    const projectRequest = row.project_request_json ? G.legacy(decode<AuthorityGuardLegacyRequest>(row.project_request_json), request.originalProjectId) : null;
    if (row.project_claim_digest) V.hash(row.project_claim_digest);
    const effect = row.effect_json ? decode<CanonicalAuthorityEffect>(row.effect_json) : null;
    if (effect) {
      V.closed(effect, ["protocolVersion", "operationKey", "requestDigest", "claimDigest", "kind", "resourceId", "originalProjectId", "previousOwnerRevision", "completedOwnerRevision", "documentDigest", "resultDigest", "effectedAt", "receiptDigest"]);
      const { receiptDigest, ...effectBase } = effect; V.integer(effect.effectedAt);
      const resultDigest = V.digest({ kind: request.kind, resourceId: request.resourceId, ownerRevision: request.baseOwnerRevision + 1, tombstoned: request.method === "delete", documentDigest: request.documentDigest });
      if (receiptDigest !== V.digest(effectBase) || effect.operationKey !== operationKey || effect.protocolVersion !== 1 || effect.claimDigest !== row.claim_digest || effect.requestDigest !== request.requestDigest || effect.kind !== request.kind || effect.resourceId !== request.resourceId || effect.originalProjectId !== request.originalProjectId || effect.previousOwnerRevision !== request.baseOwnerRevision || effect.completedOwnerRevision !== request.baseOwnerRevision + 1 || effect.documentDigest !== request.documentDigest || effect.resultDigest !== resultDigest) throw new Error("canonical_authority.effect_record");
    }
    const projectReceipt = row.project_receipt_json ? decode<AuthorityGuardCompletion>(row.project_receipt_json) : null;
    if (projectReceipt) {
      V.closed(projectReceipt, ["projectId", "operationKey", "claimDigest", "ownerKind", "ownerId", "operationKind", "requestDigest", "previousRevision", "completedRevision", "resultDigest", "completedAt", "receiptDigest"]);
      const { receiptDigest, ...receiptBase } = projectReceipt; V.integer(projectReceipt.completedAt);
      if (!projectRequest || !effect || receiptDigest !== V.digest(receiptBase) || projectReceipt.projectId !== request.originalProjectId || projectReceipt.operationKey !== operationKey || projectReceipt.claimDigest !== row.project_claim_digest || projectReceipt.requestDigest !== request.requestDigest || projectReceipt.ownerKind !== projectRequest.ownerKind || projectReceipt.ownerId !== projectRequest.ownerId || projectReceipt.operationKind !== projectRequest.operationKind || projectReceipt.previousRevision !== projectRequest.expectedRevision || projectReceipt.completedRevision !== projectRequest.expectedRevision + 1 || projectReceipt.resultDigest !== effect.resultDigest) throw new Error("canonical_authority.project_receipt_record");
    }
    if (row.phase === "reserved" && (projectRequest || effect || projectReceipt) || row.phase !== "reserved" && row.phase !== "unknown" && (!projectRequest || !row.project_claim_digest) || ["effect_applied", "completed"].includes(row.phase) && !effect || row.phase === "completed" && !projectReceipt) throw new Error("canonical_authority.phase_record");
    return V.clone({ request, claimDigest: row.claim_digest, phase: row.phase, projectRequest, projectClaimDigest: row.project_claim_digest, effect, projectReceipt });
  }
}
