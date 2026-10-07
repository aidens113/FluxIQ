import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { SQLiteRepository, type SQLiteTransaction } from "../../../database-manager/storage/sqlite-repository.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabaseLease } from "../project/database-owner/index.ts";
import { AutomationStudioProjectAuthorityGuardStore as Guard, type AuthorityGuardCompletionCapability, type AuthorityGuardLegacyRequest } from "../project/authority-guard/index.ts";
import { CANONICAL_AUTHORITY_SCHEMA } from "./migration.ts";
import { CanonicalAuthorityCatalogue } from "./catalogue.ts";
import { CanonicalAuthorityLifecycle } from "./lifecycle.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";
import { CanonicalAuthorityWholeSql } from "./whole-sql.ts";
import type { CanonicalAutomationStudioRepositories } from "../contracts.ts";
import { canonicalAutomationStudioSQLiteFactoryRoot } from "../sqlite-repository.ts";
import type { CanonicalAuthorityOptions, CanonicalWholeCapability, CanonicalWholeSqlCapability, CanonicalWholeEffect, CanonicalWholeEffectKind, CanonicalWholeOperationKind, CanonicalWholeRequest } from "./contracts.ts";

type Context = { owner: CanonicalAuthorityWholeOperation; capability: CanonicalWholeCapability; request: CanonicalWholeRequest; claimDigest: string; guard: Guard; projectCapability: AuthorityGuardCompletionCapability; projectRequest: AuthorityGuardLegacyRequest; lease: AutomationStudioProjectDatabaseLease; projectClaimDigest: string; sqlOwner?: CanonicalAuthorityWholeSql };
const execution = new AsyncLocalStorage<Context>();
const projectEffects: readonly CanonicalWholeEffectKind[] = ["catalogue_membership", "project_manifest", "project_hierarchy_nodes", "project_hierarchy_deleted", "project_preferences"];
const flowEffects: readonly CanonicalWholeEffectKind[] = ["canonical_flow", "project_flow_document", "flow_membership", "flow_source", "generated_config", "sql_flow_metadata", "project_change_feed"];

/** Private real-writer participant. Completion derives required receipts, never callback assertions. */
export class CanonicalAuthorityWholeOperation {
  private readonly database: SQLiteRepository;
  private readonly lifecycle = new CanonicalAuthorityLifecycle();
  readonly catalogue: CanonicalAuthorityCatalogue;
  readonly options: CanonicalAuthorityOptions;
  private constructor(readonly globalRoot: string, options: CanonicalAuthorityOptions) {
    if (!path.isAbsolute(globalRoot) || globalRoot.length > 4096 || globalRoot.includes("\0")) throw new Error("canonical_whole.root");
    this.globalRoot = path.resolve(globalRoot); this.options = V.options(options);
    this.database = new SQLiteRepository({ rootDir: this.globalRoot, kind: "automation.flows", layoutVersion: 2 });
    this.catalogue = new CanonicalAuthorityCatalogue(this.globalRoot, this.options.projectRootDir);
  }
  static async fromFactory(repositories: CanonicalAutomationStudioRepositories, options: CanonicalAuthorityOptions): Promise<CanonicalAuthorityWholeOperation> {
    const owner = new CanonicalAuthorityWholeOperation(canonicalAutomationStudioSQLiteFactoryRoot(repositories), options);
    await owner.catalogue.layout(); return owner;
  }
  async createProject<T>(input: JsonObject, body: (projectId: string) => Promise<T>): Promise<T> {
    const projectId = randomUUID(); return this.run("project.create", projectId, null, input, () => body(projectId));
  }
  async createFlow<T>(projectId: string, input: JsonObject, body: (flowId: string) => Promise<T>): Promise<T> {
    const flowId = `flow.${randomUUID()}`; return this.run("flow.create", projectId, flowId, input, () => body(flowId));
  }
  async saveFlow<T>(projectId: string, flowId: string, input: JsonObject, body: () => Promise<T>): Promise<T> {
    return this.run("flow.save", projectId, flowId, input, body);
  }
  private async run<T>(operationKind: CanonicalWholeOperationKind, projectId: string, flowId: string | null, input: JsonObject, body: () => Promise<T>): Promise<T> {
    if (execution.getStore()) throw new Error("canonical_whole.nested_operation");
    V.id(projectId); if (flowId !== null) V.id(flowId); const frozen = V.clone(input);
    if (!["project.create", "flow.create", "flow.save"].includes(operationKind) || (operationKind === "project.create") !== (flowId === null)) throw new Error("canonical_whole.operation_kind");
    const admitted = await this.reserve(operationKind, projectId, flowId, V.digest(frozen));
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: this.options.projectDatabaseRootDir });
    let guard: Guard | undefined, lease: AutomationStudioProjectDatabaseLease | undefined, projectCapability: AuthorityGuardCompletionCapability | undefined, value: T | undefined; const errors: unknown[] = [];
    try {
      guard = await Guard.open({ pool, projectId });
      const state = await guard.readState();
      const projectRequest: AuthorityGuardLegacyRequest = { protocolVersion: 1, projectId, ownerKind: "whole_writer", ownerId: V.digest({ projectId, flowId, operationKind }), operationKind, operationKey: admitted.request.operationKey, requestDigest: admitted.request.requestDigest, expectedRevision: state?.completedRevision ?? 0 };
      const claimed = await guard.claimLegacy(projectRequest); if (!claimed.executionAllowed) throw new Error("canonical_whole.project_pending");
      projectCapability = claimed.capability; lease = await pool.acquire(projectId);
      await lease.database.run(CanonicalAuthorityWholeSql.schema);
      await this.database.transaction({}, async sql => { await this.pending(sql, admitted.request, "reserved"); await sql.run("update canonical_authority_operations set phase='project_claimed',project_request_json=?,project_claim_digest=? where operation_key=?", [JSON.stringify(projectRequest), claimed.record.claimDigest, admitted.request.operationKey]); });
      const context: Context = { owner: this, capability: Object.freeze({}) as CanonicalWholeCapability, request: admitted.request, claimDigest: admitted.claimDigest, guard, projectCapability, projectRequest: V.clone(claimed.record.request), lease, projectClaimDigest: claimed.record.claimDigest };
      const outcome = await execution.run(context, async () => { const answer = await body(); return { value: answer, resultDigest: await this.seal(context) }; });
      value = outcome.value; const resultDigest = outcome.resultDigest;
      await guard.completeLegacy(projectCapability, { resultDigest });
      const actual = await guard.reconcileLegacy(projectRequest);
      if (!actual?.completion || actual.completion.resultDigest !== resultDigest || actual.completion.claimDigest !== context.projectClaimDigest) throw new Error("canonical_whole.project_receipt");
      await this.database.transaction({}, async sql => {
        await this.pending(sql, context.request, "effect_applied");
        const effects = await this.effects(sql, context.request.operationKey);
        if (V.digest({ requestDigest: context.request.requestDigest, effects }) !== resultDigest) throw new Error("canonical_whole.global_receipt");
        const project = await this.catalogue.project(sql, projectId);
        await this.lifecycle.complete(sql, projectId, context.request.operationKey, context.request.baseLifecycleRevision, V.digest(project));
        await sql.run("update canonical_authority_operations set phase='completed',project_receipt_json=? where operation_key=?", [JSON.stringify(actual.completion), context.request.operationKey]);
        await sql.run("update canonical_authority_project_fences set revision=revision+1 where original_project_id=?", [projectId]);
      });
    } catch (error) {
      errors.push(error);
      if (guard && projectCapability) try { await guard.markLegacyUnknown(projectCapability, "effect_uncertain"); } catch (failure) { errors.push(failure); }
      try { await this.database.transaction({}, async sql => { await sql.run("update canonical_authority_operations set phase='unknown' where operation_key=? and phase!='completed'", [admitted.request.operationKey]); }); } catch (failure) { errors.push(failure); }
    }
    if (lease) try { await lease.release(); } catch (error) { errors.push(error); }
    if (guard) try { await guard.close(); } catch (error) { errors.push(error); }
    try { await pool.closeAll(); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0]; if (errors.length) throw new AggregateError(errors, "canonical_whole.operation_failed");
    return value as T;
  }
  async requireProject(projectId: string): Promise<JsonObject> {
    const context = this.context(projectId);
    return this.database.transaction({}, async sql => { await this.pending(sql, context.request, "project_claimed"); return this.catalogue.project(sql, projectId); });
  }
  async catalogueIndex(): Promise<JsonObject> {
    const context = this.context(); return this.database.transaction({}, async sql => { await this.pending(sql, context.request, "project_claimed"); return this.catalogue.index(sql); });
  }
  currentFlowId(): string {
    const identity = this.context().request.flowIdentity; if (!identity) throw new Error("canonical_whole.flow_identity"); return identity.flowId;
  }
  async globalEffect(effectKind: CanonicalWholeEffectKind, entityId: string, expected: unknown, effect: (sql: SQLiteTransaction) => Promise<unknown>): Promise<void> {
    await this.globalEffects([{ effectKind, entityId, expected }], async sql => [await effect(sql)]);
  }
  async globalEffects(plan: readonly { effectKind: CanonicalWholeEffectKind; entityId: string; expected: unknown }[], effect: (sql: SQLiteTransaction) => Promise<unknown[]>): Promise<void> {
    const context = this.context(); if (!plan.length || plan.length > 16) throw new Error("canonical_whole.effects");
    const frozen = V.clone(plan); for (const item of frozen) { V.id(item.entityId); this.allowed(context, item.effectKind); }
    await this.database.transaction({}, async sql => {
      await this.pending(sql, context.request, "project_claimed");
      const effects = [...await this.effects(sql, context.request.operationKey)];
      if (new Set(frozen.map(item => item.effectKind)).size !== frozen.length || frozen.some(item => effects.some(receipt => receipt.effectKind === item.effectKind) || item.entityId !== (context.request.flowIdentity?.flowId ?? context.request.originalProjectId))) throw new Error("canonical_whole.duplicate_or_foreign_effect");
      const actual = await effect(sql); if (actual.length !== frozen.length) throw new Error("canonical_whole.effects");
      for (const [index, item] of frozen.entries()) {
        if (effects.some(receipt => receipt.effectKind === item.effectKind)) throw new Error("canonical_whole.duplicate_effect");
        effects.push(this.receipt(item.effectKind, item.entityId, V.digest(item.expected), V.digest(actual[index])));
      }
      await this.writeEffects(sql, context.request.operationKey, effects);
    });
  }
  async fileEffect(effectKind: CanonicalWholeEffectKind, entityId: string, expected: unknown, actual: unknown): Promise<void> {
    await this.globalEffect(effectKind, entityId, expected, async () => actual);
  }
  async canonicalFlow(document: JsonObject, domainId: string | null): Promise<void> {
    const context = this.context(), identity = context.request.flowIdentity, frozen = V.clone(document);
    if (!identity || frozen.flowId !== identity.flowId || frozen.projectId !== context.request.originalProjectId) throw new Error("canonical_whole.flow_identity");
    await this.globalEffect("canonical_flow", identity.flowId, frozen, async sql => {
      const owner = await sql.get<{ original_project_id: string; owner_revision: number; tombstoned: number }>("select * from canonical_authority_owners where kind='automation.flows' and resource_id=?", [identity.flowId]);
      if (!owner || owner.original_project_id !== context.request.originalProjectId || owner.owner_revision !== identity.baseOwnerRevision || owner.tombstoned !== 0) throw new Error("canonical_whole.flow_owner");
      const now = Date.now(); await sql.run('insert into "automation.flows" (id,kind,data,created_at_ms,updated_at_ms) values(?,?,?,?,?) on conflict(id) do update set data=excluded.data,updated_at_ms=excluded.updated_at_ms', [identity.flowId, "automation.flows", JSON.stringify({ document: frozen, domainId }), now, now]);
      await sql.run("update canonical_authority_owners set owner_revision=owner_revision+1 where kind='automation.flows' and resource_id=?", [identity.flowId]);
      const actual = await sql.get<{ data: string }>('select data from "automation.flows" where id=?', [identity.flowId]); return JSON.parse(actual!.data).document;
    });
  }
  static current(globalRoot: string): CanonicalAuthorityWholeOperation | null {
    const context = execution.getStore(); return context && context.owner.globalRoot === path.resolve(globalRoot) ? context.owner : null;
  }
  sqlCapability(kind: "sql_flow_metadata" | "project_change_feed", entityId: string, input: unknown): CanonicalWholeSqlCapability {
    const context = this.context(); this.allowed(context, kind);
    context.sqlOwner ??= CanonicalAuthorityWholeSql.fromAdmission(context.capability);
    return context.sqlOwner.issue(kind, entityId, input);
  }
  static liveSqlParent(capability: CanonicalWholeCapability) {
    const context = execution.getStore(); if (!context || capability !== context.capability) throw new Error("canonical_whole.capability");
    return Object.freeze({ projectId: context.request.originalProjectId, databasePath: context.lease.database.filePath, operationKey: context.request.operationKey, requestDigest: context.request.requestDigest, claimDigest: context.projectClaimDigest, projectRequest: context.projectRequest });
  }
  private context(projectId?: string): Context {
    const context = execution.getStore(); if (!context || context.owner !== this || projectId !== undefined && context.request.originalProjectId !== projectId) throw new Error("canonical_whole.capability"); return context;
  }
  private allowed(context: Context, kind: CanonicalWholeEffectKind): void {
    if (!(context.request.operationKind === "project.create" ? projectEffects : flowEffects).includes(kind)) throw new Error("canonical_whole.effect_kind");
  }
  private receipt(effectKind: CanonicalWholeEffectKind, entityId: string, expectedDigest: string, actualDigest: string): CanonicalWholeEffect {
    if (actualDigest !== expectedDigest) throw new Error("canonical_whole.effect_result");
    const base = { effectKind, entityId, expectedDigest, actualDigest, effectedAt: Date.now() }; return V.clone({ ...base, receiptDigest: V.digest(base) });
  }
  private async reserve(operationKind: CanonicalWholeOperationKind, originalProjectId: string, flowId: string | null, inputDigest: string) {
    await this.catalogue.layout(); const operationKey = randomUUID();
    return this.database.transaction({}, async sql => {
      for (const statement of CANONICAL_AUTHORITY_SCHEMA) await sql.run(statement); await sql.run(CanonicalAuthorityLifecycle.schema);
      await sql.run("update canonical_authority_config set mode='routing' where singleton=1");
      if (await sql.get("select operation_key from canonical_authority_operations where original_project_id=? and phase!='completed' limit 1", [originalProjectId])) throw new Error("canonical_whole.unresolved");
      await sql.run("insert or ignore into canonical_authority_project_fences values(?,0,'routing',null)", [originalProjectId]);
      if ((await sql.get<{ mode: string }>("select mode from canonical_authority_project_fences where original_project_id=?", [originalProjectId]))?.mode !== "routing") throw new Error("canonical_whole.capturing");
      let baseLifecycleRevision = 0, flowIdentity: CanonicalWholeRequest["flowIdentity"] = null;
      if (operationKind === "project.create") await this.lifecycle.create(sql, originalProjectId, operationKey);
      else {
        const lifecycle = await this.lifecycle.admit(sql, originalProjectId, operationKey), project = await this.catalogue.project(sql, originalProjectId);
        if (V.digest(project) !== lifecycle.catalogueDigest) throw new Error("canonical_whole.lifecycle_membership_changed"); baseLifecycleRevision = lifecycle.revision;
        const owner = await sql.get<{ original_project_id: string; owner_revision: number; tombstoned: number }>("select * from canonical_authority_owners where kind='automation.flows' and resource_id=?", [flowId]);
        if (operationKind === "flow.create") { if (owner || await sql.get('select id from "automation.flows" where id=?', [flowId])) throw new Error("canonical_whole.flow_allocated"); await sql.run("insert into canonical_authority_owners values('automation.flows',?,?,0,0)", [flowId, originalProjectId]); }
        else if (!owner || owner.original_project_id !== originalProjectId || owner.tombstoned !== 0) throw new Error("canonical_whole.flow_owner");
        flowIdentity = { flowId: flowId!, baseOwnerRevision: owner?.owner_revision ?? 0, allocation: operationKind === "flow.create" ? "generated" : "existing" };
      }
      const plan = operationKind === "project.create" ? projectEffects : flowEffects;
      const base = { recordKind: "whole_writer" as const, wholeProtocol: "fluxiq.canonical-whole.v1" as const, operationKey, operationKind, originalProjectId, baseLifecycleRevision, flowIdentity, effectPlanDigest: V.digest(plan) };
      const request = V.clone({ ...base, requestDigest: V.digest({ ...base, inputDigest }) });
      if (Buffer.byteLength(JSON.stringify(request)) > 8192) throw new Error("canonical_whole.request_size");
      const claimDigest = V.digest(request); await sql.run("insert into canonical_authority_operations(operation_key,request_json,claim_digest,original_project_id,phase) values(?,?,?,?,'reserved')", [operationKey, JSON.stringify(request), claimDigest, originalProjectId]);
      return { request, claimDigest };
    });
  }
  private async pending(sql: SQLiteTransaction, request: CanonicalWholeRequest, phase: string): Promise<void> {
    const row = await sql.get<{ request_json: string; phase: string }>("select request_json,phase from canonical_authority_operations where operation_key=?", [request.operationKey]);
    if (!row || row.phase !== phase || Buffer.byteLength(row.request_json) > 8192 || V.digest(JSON.parse(row.request_json)) !== V.digest(request)) throw new Error("canonical_whole.pending");
    const lifecycle = await this.lifecycle.read(sql, request.originalProjectId);
    if (!lifecycle || lifecycle.pendingOperationKey !== request.operationKey || lifecycle.revision !== request.baseLifecycleRevision) throw new Error("canonical_whole.lifecycle_pending");
  }
  private async effects(sql: SQLiteTransaction, key: string): Promise<CanonicalWholeEffect[]> {
    const row = await sql.get<{ effect_json: string | null; request_json: string; claim_digest: string; project_claim_digest: string }>("select effect_json,request_json,claim_digest,project_claim_digest from canonical_authority_operations where operation_key=?", [key]);
    if (!row?.effect_json) return []; if (Buffer.byteLength(row.effect_json) > 16384) throw new Error("canonical_whole.receipt_size");
    const receipt = JSON.parse(row.effect_json); V.closed(receipt, ["wholeProtocol", "operationKey", "requestDigest", "globalClaimDigest", "projectClaimDigest", "effectPlanDigest", "effects", "resultDigest", "effectedAt", "receiptDigest"]);
    if (Buffer.byteLength(row.request_json) > 8192) throw new Error("canonical_whole.request_size"); const request: CanonicalWholeRequest = JSON.parse(row.request_json);
    if (receipt.wholeProtocol !== "fluxiq.canonical-whole.v1" || receipt.operationKey !== key || receipt.requestDigest !== request.requestDigest || receipt.globalClaimDigest !== row.claim_digest || receipt.projectClaimDigest !== row.project_claim_digest || receipt.effectPlanDigest !== request.effectPlanDigest) throw new Error("canonical_whole.receipt");
    const effects: unknown = receipt.effects; if (!Array.isArray(effects) || effects.length > 16) throw new Error("canonical_whole.effects");
    const plan = request.operationKind === "project.create" ? projectEffects : flowEffects;
    for (const effect of effects) { V.closed(effect, ["effectKind", "entityId", "expectedDigest", "actualDigest", "receiptDigest", "effectedAt"]); V.id(effect.entityId); V.hash(effect.expectedDigest); V.hash(effect.actualDigest); V.hash(effect.receiptDigest); V.integer(effect.effectedAt); const { receiptDigest, ...base } = effect; if (!plan.some(kind => kind === effect.effectKind) || effect.entityId !== (request.flowIdentity?.flowId ?? request.originalProjectId) || effect.expectedDigest !== effect.actualDigest || V.digest(base) !== receiptDigest) throw new Error("canonical_whole.effect_receipt"); }
    if (new Set(effects.map(effect => effect.effectKind)).size !== effects.length) throw new Error("canonical_whole.duplicate_effect");
    if (receipt.resultDigest !== null || receipt.effectedAt !== null || receipt.receiptDigest !== null) {
      V.hash(receipt.resultDigest); V.integer(receipt.effectedAt); V.hash(receipt.receiptDigest);
      const { receiptDigest, ...base } = receipt;
      if (effects.length !== plan.length || receipt.resultDigest !== V.digest({ requestDigest: request.requestDigest, effects }) || receiptDigest !== V.digest(base)) throw new Error("canonical_whole.global_receipt");
    }
    return V.clone(effects as CanonicalWholeEffect[]);
  }
  private async writeEffects(sql: SQLiteTransaction, key: string, effects: CanonicalWholeEffect[]): Promise<void> {
    const context = this.context(); if (key !== context.request.operationKey) throw new Error("canonical_whole.capability");
    const receipt = { wholeProtocol: "fluxiq.canonical-whole.v1", operationKey: key, requestDigest: context.request.requestDigest, globalClaimDigest: context.claimDigest, projectClaimDigest: context.projectClaimDigest, effectPlanDigest: context.request.effectPlanDigest, effects, resultDigest: null, effectedAt: null, receiptDigest: null };
    const text = JSON.stringify(receipt); if (effects.length > 16 || Buffer.byteLength(text) > 16384) throw new Error("canonical_whole.receipt_size"); await sql.run("update canonical_authority_operations set effect_json=? where operation_key=?", [text, key]);
  }
  private async seal(context: Context): Promise<string> {
    if (context.request.operationKind !== "project.create") {
      if (!context.sqlOwner) throw new Error("canonical_whole.sql_receipts_missing");
      for (const kind of ["sql_flow_metadata", "project_change_feed"] as const) {
        const receipt = await context.sqlOwner.read(context.lease.database, kind); if (!receipt) throw new Error("canonical_whole.sql_receipts_missing");
        await this.fileEffect(kind, receipt.entityId, { digest: receipt.actualDigest }, { digest: receipt.actualDigest });
      }
    }
    return this.database.transaction({}, async sql => {
      await this.pending(sql, context.request, "project_claimed"); const effects = await this.effects(sql, context.request.operationKey), plan = context.request.operationKind === "project.create" ? projectEffects : flowEffects;
      if (effects.length !== plan.length || new Set(effects.map(effect => effect.effectKind)).size !== plan.length || plan.some(kind => !effects.some(effect => effect.effectKind === kind))) throw new Error("canonical_whole.incomplete_effects");
      const resultDigest = V.digest({ requestDigest: context.request.requestDigest, effects });
      const base = { wholeProtocol: "fluxiq.canonical-whole.v1", operationKey: context.request.operationKey, requestDigest: context.request.requestDigest, globalClaimDigest: context.claimDigest, projectClaimDigest: context.projectClaimDigest, effectPlanDigest: context.request.effectPlanDigest, effects, resultDigest, effectedAt: Date.now() };
      const text = JSON.stringify({ ...base, receiptDigest: V.digest(base) }); if (Buffer.byteLength(text) > 16384) throw new Error("canonical_whole.receipt_size");
      await sql.run("update canonical_authority_operations set phase='effect_applied',effect_json=? where operation_key=?", [text, context.request.operationKey]); return resultDigest;
    });
  }
}
