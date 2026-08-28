import { createHash, randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioChangeProposalPatch, AutomationStudioFlowAdaptation } from "../model/index.ts";
import { validateAutomationStudioFlowAdaptation } from "../model/index.ts";
import { AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION } from "../runtime/compiled-plan.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import { AutomationStudioProjectCompiledPlanStore, type AutomationStudioCompiledArtifactManifest } from "./project-compiled-plan-store.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioProjectGraphRepository, type AutomationStudioGraphPatchApplied, type AutomationStudioGraphPatchOperation, type AutomationStudioGraphPatchResult } from "./project-graph-store.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioStoredAdaptationStatus = AutomationStudioFlowAdaptation["status"];
export type AutomationStudioStoredAdaptationArtifactKind = "patch" | "prompt" | "response" | "evidence" | "validation" | "rollback" | "audit";
export type AutomationStudioAdaptationApprovalMode = "adaptive" | "manual_approval" | "disabled";
export type AutomationStudioAdaptationAuditEventType = "created" | "status_changed" | "approved" | "rejected" | "applied" | "apply_failed" | "stale_base" | "rebased" | "superseded" | "rollback" | "policy_blocked" | "validation_requested";

export type AutomationStudioAdaptationRevisionBindings = { flowRevision: number; routerRevision: number | null; settingsRevision: number | null; instructionRevision: number | null };
export type AutomationStudioAdaptationArtifactRecord = { artifactId: string; adaptationId: string; artifactKind: AutomationStudioStoredAdaptationArtifactKind; objectId: string; sequence: number; summary: string; digest: string; createdAt: number };
export type AutomationStudioAdaptationSummaryRecord = { adaptationId: string; projectId: string; flowId: string; subflowId: string | null; sourceRunId: string | null; status: AutomationStudioStoredAdaptationStatus; riskLevel: AutomationStudioFlowAdaptation["riskLevel"]; approvalMode: AutomationStudioAdaptationApprovalMode; trigger: string; baseRevision: number; proposedRevision: number; appliedRevision: number | null; author: AutomationStudioFlowAdaptation["author"]; patchCount: number; evidenceCount: number; promptObjectId: string | null; responseObjectId: string | null; patchObjectId: string; evidenceObjectId: string | null; supersededByAdaptationId: string | null; statusReason: string; createdAt: number; updatedAt: number; reviewedAt: number | null; appliedAt: number | null };
export type AutomationStudioAdaptationAuditEvent = { eventId: string; adaptationId: string; eventType: AutomationStudioAdaptationAuditEventType; actorId: string | null; fromStatus: AutomationStudioStoredAdaptationStatus | null; toStatus: AutomationStudioStoredAdaptationStatus | null; reason: string; detail: JsonObject; detailObjectId: string | null; createdAt: number };
export type AutomationStudioAdaptationDetailSection = { adaptationId: string; section: "summary" | "changes" | "evidence" | "validation" | "audit" | "raw"; items: JsonValue[]; total: number; limit: number; offset: number };
export type AutomationStudioStoredAdaptationDetail = AutomationStudioAdaptationSummaryRecord & { adaptation: AutomationStudioFlowAdaptation; revisions: AutomationStudioAdaptationRevisionBindings; artifacts: AutomationStudioAdaptationArtifactRecord[] };
export type AutomationStudioAppliedAdaptationResult = { adaptation: AutomationStudioStoredAdaptationDetail; patch: AutomationStudioGraphPatchResult; compiledArtifact: AutomationStudioCompiledArtifactManifest | null; auditEvent: AutomationStudioAdaptationAuditEvent };

type ListInput = { flowId?: string; subflowId?: string; status?: string; risk?: string; search?: string; sort?: "updated" | "status" | "risk" | "trigger"; direction?: "asc" | "desc"; limit?: number; offset?: number };
type WrittenArtifact = { artifactId: string; objectId: string; kind: AutomationStudioStoredAdaptationArtifactKind; sequence: number; summary: string; digest: string; createdAt: number };
type AdaptationDbStatus = "draft" | "pending_approval" | "approved" | "applied" | "rejected" | "failed";
type AdaptationRow = { adaptation_id: string; flow_id: string; subflow_id: string | null; base_revision: number; proposed_revision: number; trigger: string; status: AdaptationDbStatus; risk_level: AutomationStudioFlowAdaptation["riskLevel"]; approval_mode: AutomationStudioAdaptationApprovalMode; patch_object_id: string; evidence_object_id: string | null; created_at_ms: number; updated_at_ms: number; reviewed_at_ms: number | null; applied_at_ms: number | null; source_run_id: string | null; author: AutomationStudioFlowAdaptation["author"]; status_reason: string; status_detail_json: string; base_flow_revision: number | null; base_router_revision: number | null; base_settings_revision: number | null; base_instruction_revision: number | null; applied_revision: number | null; prompt_object_id: string | null; response_object_id: string | null; rollback_object_id: string | null; audit_object_id: string | null; patch_digest: string; evidence_digest: string; superseded_by_adaptation_id: string | null };
type ArtifactRow = { artifact_id: string; adaptation_id: string; artifact_kind: AutomationStudioStoredAdaptationArtifactKind; object_id: string; sequence: number; summary: string; digest: string; created_at_ms: number };
type AuditRow = { event_id: string; adaptation_id: string; event_type: AutomationStudioAdaptationAuditEventType; actor_id: string | null; from_status: string | null; to_status: string | null; reason: string; detail_object_id: string | null; detail_json: string; created_at_ms: number };

export class AutomationStudioProjectAdaptationStore {
  private constructor(private readonly pool: AutomationStudioProjectDatabasePool, private readonly lease: AutomationStudioProjectDatabaseLease, private readonly content: AutomationStudioProjectContentStore) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectAdaptationStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      const content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId });
      return new AutomationStudioProjectAdaptationStore(input.pool, lease, content);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  async close(): Promise<void> { await this.content.close(); await this.lease.release(); }

  async putAdaptation(input: { adaptation: AutomationStudioFlowAdaptation; approvalMode?: AutomationStudioAdaptationApprovalMode; prompt?: unknown; response?: unknown; evidence?: unknown; statusReason?: string; actorId?: string; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const validation = validateAutomationStudioFlowAdaptation(input.adaptation);
    if (!validation.ok) throw new Error(`Invalid Automation Studio adaptation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    const now = input.changedAt ?? input.adaptation.updatedAt ?? Date.now();
    const revisions = await this.currentRevisionBindings(input.adaptation.flowId);
    const status = normalizeAdaptationStatus(input.adaptation.status);
    const approvalMode = input.approvalMode ?? approvalModeFromAdaptation(input.adaptation);
    const patchWrite = await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "patch", value: input.adaptation.patch, sequence: 0, summary: `${input.adaptation.patch.length} changes`, createdAt: now });
    const promptWrite = input.prompt === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "prompt", value: input.prompt, sequence: 0, summary: "LLM prompt", createdAt: now });
    const responseWrite = input.response === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "response", value: input.response, sequence: 0, summary: "LLM response", createdAt: now });
    const evidenceWrite = input.evidence === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "evidence", value: input.evidence, sequence: 0, summary: "Runtime evidence", createdAt: now });
    const statusDetail = { canonicalStatus: status, validationResults: input.adaptation.validationResults ?? [], appliedTo: input.adaptation.appliedTo ?? [], metadata: input.adaptation.metadata ?? {}, patchCount: input.adaptation.patch.length } satisfies JsonObject;
    await this.lease.database.transaction(async (sql) => {
      await sql.run(`insert into adaptations (adaptation_id, flow_id, subflow_id, base_revision, proposed_revision, trigger, status, risk_level, approval_mode, patch_object_id, evidence_object_id, created_at_ms, updated_at_ms, reviewed_at_ms, applied_at_ms, source_run_id, author, status_reason, status_detail_json, base_flow_revision, base_router_revision, base_settings_revision, base_instruction_revision, applied_revision, prompt_object_id, response_object_id, rollback_object_id, audit_object_id, patch_digest, evidence_digest, superseded_by_adaptation_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(adaptation_id) do update set subflow_id = excluded.subflow_id, base_revision = excluded.base_revision, proposed_revision = excluded.proposed_revision, trigger = excluded.trigger, status = excluded.status, risk_level = excluded.risk_level, approval_mode = excluded.approval_mode, patch_object_id = excluded.patch_object_id, evidence_object_id = excluded.evidence_object_id, updated_at_ms = excluded.updated_at_ms, reviewed_at_ms = excluded.reviewed_at_ms, applied_at_ms = excluded.applied_at_ms, source_run_id = excluded.source_run_id, author = excluded.author, status_reason = excluded.status_reason, status_detail_json = excluded.status_detail_json, base_flow_revision = excluded.base_flow_revision, base_router_revision = excluded.base_router_revision, base_settings_revision = excluded.base_settings_revision, base_instruction_revision = excluded.base_instruction_revision, applied_revision = excluded.applied_revision, prompt_object_id = coalesce(excluded.prompt_object_id, adaptations.prompt_object_id), response_object_id = coalesce(excluded.response_object_id, adaptations.response_object_id), patch_digest = excluded.patch_digest, evidence_digest = excluded.evidence_digest, superseded_by_adaptation_id = excluded.superseded_by_adaptation_id`,
        [input.adaptation.adaptationId, input.adaptation.flowId, input.adaptation.subflowId ?? null, positive(input.adaptation.metadata?.baseRevision, revisions.flowRevision), positive(input.adaptation.metadata?.proposedRevision, revisions.flowRevision + 1), input.adaptation.trigger, dbStatus(status), dbRisk(input.adaptation.riskLevel), approvalMode, patchWrite.objectId, evidenceWrite?.objectId ?? null, input.adaptation.createdAt, now, reviewedAtFor(status, now), status === "applied" ? now : null, input.adaptation.sourceRunId ?? null, input.adaptation.author, input.statusReason ?? "", JSON.stringify(statusDetail), revisions.flowRevision, revisions.routerRevision, revisions.settingsRevision, revisions.instructionRevision, status === "applied" ? positive(input.adaptation.metadata?.appliedRevision, revisions.flowRevision) : null, promptWrite?.objectId ?? null, responseWrite?.objectId ?? null, null, null, patchWrite.digest, evidenceWrite?.digest ?? "", stringValue(input.adaptation.metadata?.supersededByAdaptationId) ?? null]
      );
      for (const artifact of [patchWrite, promptWrite, responseWrite, evidenceWrite].filter((item): item is WrittenArtifact => Boolean(item))) await this.upsertArtifactRow(sql, input.adaptation.adaptationId, artifact);
    });
    await this.appendAuditEvent({ adaptationId: input.adaptation.adaptationId, eventType: "created", actorId: input.actorId ?? input.adaptation.author, toStatus: status, reason: input.statusReason ?? "Adaptation recorded.", detail: { approvalMode, revisions }, createdAt: now });
    return this.mustGetAdaptation(input.adaptation.adaptationId);
  }

  async listAdaptationsPage(input: ListInput = {}): Promise<{ adaptations: AutomationStudioAdaptationSummaryRecord[]; total: number; limit: number; offset: number }> {
    const limit = clamp(input.limit, 1, 100, 25);
    const offset = clamp(input.offset, 0, 10_000_000, 0);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) { clauses.push("flow_id = ?"); params.push(requiredId(input.flowId, "flow")); }
    if (input.subflowId) { clauses.push("subflow_id = ?"); params.push(requiredId(input.subflowId, "subflow")); }
    if (input.status) { clauses.push("status = ?"); params.push(dbStatus(normalizeAdaptationStatus(input.status))); }
    if (input.risk) { clauses.push("risk_level = ?"); params.push(dbRisk(input.risk)); }
    if (input.search?.trim()) { clauses.push("(adaptation_id like ? or trigger like ?)"); const value = `%${input.search.trim()}%`; params.push(value, value); }
    const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
    const order = adaptationOrder(input.sort ?? "updated", input.direction ?? "desc");
    const [rows, count] = await Promise.all([this.lease.database.all<AdaptationRow>(`select * from adaptations${where} ${order} limit ? offset ?`, [...params, limit, offset]), this.lease.database.get<{ total: number }>(`select count(*) as total from adaptations${where}`, params)]);
    return { adaptations: rows.map((row) => summaryFromRow(this.lease.projectId, row)), total: count?.total ?? 0, limit, offset };
  }

  async getAdaptation(adaptationId: string): Promise<AutomationStudioStoredAdaptationDetail | null> {
    const row = await this.lease.database.get<AdaptationRow>("select * from adaptations where adaptation_id = ?", [requiredId(adaptationId, "adaptation")]);
    if (!row) return null;
    const artifacts = (await this.listArtifacts({ adaptationId, limit: 100, offset: 0 })).artifacts;
    return { ...summaryFromRow(this.lease.projectId, row), adaptation: await this.adaptationFromRow(row), revisions: revisionsFromRow(row), artifacts };
  }

  async mustGetAdaptation(adaptationId: string): Promise<AutomationStudioStoredAdaptationDetail> {
    const detail = await this.getAdaptation(adaptationId);
    if (!detail) throw new Error(`Unknown adaptation: ${adaptationId}`);
    return detail;
  }

  async getDetailSection(input: { adaptationId: string; section: AutomationStudioAdaptationDetailSection["section"]; limit?: number; offset?: number }): Promise<AutomationStudioAdaptationDetailSection> {
    const detail = await this.mustGetAdaptation(input.adaptationId);
    const allItems = input.section === "audit" ? (await this.listAuditEvents({ adaptationId: input.adaptationId, limit: 100, offset: 0 })).events as unknown as JsonValue[] : sectionItems(detail, input.section);
    const limit = clamp(input.limit, 1, 100, 25);
    const offset = clamp(input.offset, 0, 10_000_000, 0);
    return { adaptationId: input.adaptationId, section: input.section, items: allItems.slice(offset, offset + limit), total: allItems.length, limit, offset };
  }

  async listArtifacts(input: { adaptationId: string; kind?: AutomationStudioStoredAdaptationArtifactKind; limit?: number; offset?: number }): Promise<{ artifacts: AutomationStudioAdaptationArtifactRecord[]; total: number; limit: number; offset: number }> {
    const limit = clamp(input.limit, 1, 100, 25);
    const offset = clamp(input.offset, 0, 10_000_000, 0);
    const where = input.kind ? "adaptation_id = ? and artifact_kind = ?" : "adaptation_id = ?";
    const params: unknown[] = input.kind ? [requiredId(input.adaptationId, "adaptation"), input.kind] : [requiredId(input.adaptationId, "adaptation")];
    const [rows, count] = await Promise.all([
      this.lease.database.all<ArtifactRow>(`select * from adaptation_artifacts where ${where} order by artifact_kind, sequence, artifact_id limit ? offset ?`, [...params, limit, offset]),
      this.lease.database.get<{ total: number }>(`select count(*) as total from adaptation_artifacts where ${where}`, params)
    ]);
    return { artifacts: rows.map(artifactFromRow), total: count?.total ?? 0, limit, offset };
  }

  async listAuditEvents(input: { adaptationId: string; limit?: number; offset?: number }): Promise<{ events: AutomationStudioAdaptationAuditEvent[]; total: number; limit: number; offset: number }> {
    const limit = clamp(input.limit, 1, 100, 25);
    const offset = clamp(input.offset, 0, 10_000_000, 0);
    const [rows, count] = await Promise.all([
      this.lease.database.all<AuditRow>("select * from adaptation_audit_events where adaptation_id = ? order by created_at_ms, event_id limit ? offset ?", [requiredId(input.adaptationId, "adaptation"), limit, offset]),
      this.lease.database.get<{ total: number }>("select count(*) as total from adaptation_audit_events where adaptation_id = ?", [requiredId(input.adaptationId, "adaptation")])
    ]);
    return { events: rows.map(auditFromRow), total: count?.total ?? 0, limit, offset };
  }

  decidePolicy(input: { approvalMode: AutomationStudioAdaptationApprovalMode; validated: boolean; action: "create" | "apply" | "auto_apply" }): { ok: boolean; autoApply: boolean; requiresManualApproval: boolean; reason: string; compileRequired: boolean } {
    if (input.approvalMode === "disabled") return { ok: false, autoApply: false, requiresManualApproval: false, compileRequired: false, reason: "No LLM intervention policy blocks adaptation creation and application." };
    if (input.action === "auto_apply" && input.approvalMode === "manual_approval") return { ok: false, autoApply: false, requiresManualApproval: true, compileRequired: true, reason: "Manual approval policy blocks automatic adaptation application." };
    if ((input.action === "apply" || input.action === "auto_apply") && !input.validated) return { ok: false, autoApply: false, requiresManualApproval: true, compileRequired: true, reason: "Adaptation must pass validation before application." };
    return { ok: true, autoApply: input.action === "auto_apply" && input.approvalMode === "adaptive", requiresManualApproval: input.approvalMode === "manual_approval", compileRequired: input.action !== "create", reason: input.approvalMode === "adaptive" ? "Fully adaptive policy allows validated graph-safe application." : "Manual policy allows explicit reviewer application." };
  }

  async applyApprovedAdaptation(input: { adaptationId: string; actorId?: string; mutationId?: string; changedAt?: number; compile?: boolean }): Promise<AutomationStudioAppliedAdaptationResult> {
    const detail = await this.mustGetAdaptation(input.adaptationId);
    const validated = (detail.adaptation.validationResults ?? []).some((result) => result.status === "succeeded") || detail.status === "validated";
    const policy = this.decidePolicy({ approvalMode: detail.approvalMode, validated, action: input.actorId === "runtime" ? "auto_apply" : "apply" });
    if (!policy.ok) {
      await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "policy_blocked", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: detail.status, reason: policy.reason, detail: { policy }, createdAt: input.changedAt ?? Date.now() });
      throw new Error(policy.reason);
    }
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.pool, projectId: this.lease.projectId });
    try {
      const currentRevision = await graph.getFlowRevision(detail.flowId);
      if (currentRevision !== detail.baseRevision) {
        await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "stale_base", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: detail.status, reason: `Flow is at revision ${currentRevision}; adaptation base is ${detail.baseRevision}.`, detail: { currentRevision, baseRevision: detail.baseRevision }, createdAt: input.changedAt ?? Date.now() });
        throw new Error(`Adaptation ${detail.adaptationId} has a stale base revision.`);
      }
      const operations = await graphPatchOperationsForAdaptation(graph, detail.adaptation);
      const patched = await graph.applyPatch({ pool: this.pool, projectId: this.lease.projectId, flowId: detail.flowId, baseRevision: detail.baseRevision, mutationId: input.mutationId ?? `adaptation.apply.${detail.adaptationId}`, operations, authorId: input.actorId ?? "adaptation", message: `Apply adaptation ${detail.adaptationId}`, ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) });
      if (patched.response.status !== "applied") throw new Error(`Adaptation ${detail.adaptationId} could not apply cleanly.`);
      const applied = patched.response as AutomationStudioGraphPatchApplied;
      const compiledArtifact = input.compile === false ? null : await this.compileAppliedRevision(detail.flowId, applied.revisionNumber, input.changedAt);
      const rollback = await this.writeArtifact({ adaptationId: detail.adaptationId, kind: "rollback", value: applied.inverseOperations, sequence: 0, summary: "Inverse graph patch", createdAt: input.changedAt ?? Date.now() });
      await this.upsertArtifactRow(this.lease.database, detail.adaptationId, rollback);
      const nextAdaptation: AutomationStudioFlowAdaptation = { ...detail.adaptation, status: "applied", updatedAt: input.changedAt ?? Date.now(), appliedTo: applied.changedEntities.map((entity) => ({ kind: entity.entityKind === "node" ? "action_target" : "router", id: entity.entityId })), metadata: compact({ ...(detail.adaptation.metadata ?? {}), appliedRevision: applied.revisionNumber, ...(applied.validationJobId ? { validationJobId: applied.validationJobId } : {}), ...(compiledArtifact ? { compiledArtifactId: compiledArtifact.artifactId } : {}), graphPatchMutationId: patched.mutationId }) };
      await this.updateStatusFields(nextAdaptation, { rollbackObjectId: rollback.objectId, appliedRevision: applied.revisionNumber, appliedAt: nextAdaptation.updatedAt, statusReason: policy.reason });
      const auditEvent = await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "applied", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: "applied", reason: policy.reason, detail: compact({ revisionNumber: applied.revisionNumber, changedEntities: applied.changedEntities as unknown as JsonValue, ...(compiledArtifact ? { compiledArtifactId: compiledArtifact.artifactId } : {}) }), createdAt: nextAdaptation.updatedAt });
      return { adaptation: await this.mustGetAdaptation(detail.adaptationId), patch: patched.response, compiledArtifact, auditEvent };
    } catch (error) {
      await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "apply_failed", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: "rejected", reason: error instanceof Error ? error.message : String(error), detail: {}, createdAt: input.changedAt ?? Date.now() }).catch(() => undefined);
      throw error;
    } finally {
      await graph.close();
    }
  }

  async supersedeAdaptation(input: { adaptationId: string; supersededByAdaptationId: string; actorId?: string; reason?: string; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    await this.mustGetAdaptation(input.supersededByAdaptationId);
    const now = input.changedAt ?? Date.now();
    await this.lease.database.run("update adaptations set status = 'failed', status_detail_json = ?, status_reason = ?, superseded_by_adaptation_id = ?, updated_at_ms = ? where adaptation_id = ?", [JSON.stringify({ canonicalStatus: "superseded" }), input.reason ?? "Superseded by a newer adaptation.", input.supersededByAdaptationId, now, input.adaptationId]);
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: "superseded", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: "superseded", reason: input.reason ?? "Superseded by a newer adaptation.", detail: { supersededByAdaptationId: input.supersededByAdaptationId }, createdAt: now });
    return this.mustGetAdaptation(input.adaptationId);
  }

  async rebaseAdaptation(input: { adaptationId: string; actorId?: string; reason?: string; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    const revisions = await this.currentRevisionBindings(current.flowId);
    const now = input.changedAt ?? Date.now();
    const metadata = compact({ ...(current.adaptation.metadata ?? {}), previousBaseRevision: current.baseRevision, rebasedAt: now });
    const detail = { canonicalStatus: current.status, validationResults: current.adaptation.validationResults ?? [], appliedTo: current.adaptation.appliedTo ?? [], metadata, patchCount: current.adaptation.patch.length } satisfies JsonObject;
    await this.lease.database.run(
      "update adaptations set base_revision = ?, proposed_revision = ?, base_flow_revision = ?, base_router_revision = ?, base_settings_revision = ?, base_instruction_revision = ?, status_detail_json = ?, status_reason = ?, updated_at_ms = ? where adaptation_id = ?",
      [revisions.flowRevision, revisions.flowRevision + 1, revisions.flowRevision, revisions.routerRevision, revisions.settingsRevision, revisions.instructionRevision, JSON.stringify(detail), input.reason ?? "Rebased onto current Flow revisions.", now, input.adaptationId]
    );
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: "rebased", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: current.status, reason: input.reason ?? "Rebased onto current Flow revisions.", detail: { previous: current.revisions, next: revisions }, createdAt: now });
    return this.mustGetAdaptation(input.adaptationId);
  }

  async rollbackAdaptation(input: { adaptationId: string; actorId?: string; mutationId?: string; reason?: string; changedAt?: number }): Promise<{ adaptation: AutomationStudioStoredAdaptationDetail; patch: AutomationStudioGraphPatchResult; auditEvent: AutomationStudioAdaptationAuditEvent }> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    const row = await this.lease.database.get<AdaptationRow>("select * from adaptations where adaptation_id = ?", [requiredId(input.adaptationId, "adaptation")]);
    if (!row?.rollback_object_id) throw new Error(`Adaptation ${input.adaptationId} has no rollback patch.`);
    const rollback = await this.readArtifactJson(row.rollback_object_id);
    if (!Array.isArray(rollback)) throw new Error(`Adaptation ${input.adaptationId} rollback patch is invalid.`);
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.pool, projectId: this.lease.projectId });
    const now = input.changedAt ?? Date.now();
    try {
      const baseRevision = await graph.getFlowRevision(current.flowId);
      const patched = await graph.applyPatch({ pool: this.pool, projectId: this.lease.projectId, flowId: current.flowId, baseRevision, mutationId: input.mutationId ?? `adaptation.rollback.${current.adaptationId}`, operations: rollback as AutomationStudioGraphPatchOperation[], authorId: input.actorId ?? "adaptation", message: input.reason ?? `Rollback adaptation ${current.adaptationId}`, changedAt: now });
      if (patched.response.status !== "applied") throw new Error(`Adaptation ${current.adaptationId} rollback could not apply cleanly.`);
      const metadata = compact({ ...(current.adaptation.metadata ?? {}), rollbackRevision: patched.response.revisionNumber, rollbackMutationId: patched.mutationId });
      await this.lease.database.run("update adaptations set status = 'failed', status_detail_json = ?, status_reason = ?, updated_at_ms = ? where adaptation_id = ?", [JSON.stringify({ canonicalStatus: "reverted", validationResults: current.adaptation.validationResults ?? [], appliedTo: current.adaptation.appliedTo ?? [], metadata, patchCount: current.adaptation.patch.length }), input.reason ?? "Applied stored rollback graph patch.", now, current.adaptationId]);
      const auditEvent = await this.appendAuditEvent({ adaptationId: current.adaptationId, eventType: "rollback", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: "reverted", reason: input.reason ?? "Applied stored rollback graph patch.", detail: { baseRevision, rollbackRevision: patched.response.revisionNumber }, createdAt: now });
      return { adaptation: await this.mustGetAdaptation(current.adaptationId), patch: patched.response, auditEvent };
    } finally {
      await graph.close();
    }
  }

  async setAdaptationStatus(input: { adaptationId: string; status: AutomationStudioStoredAdaptationStatus; approvalMode?: AutomationStudioAdaptationApprovalMode; actorId?: string; reason?: string; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    const now = input.changedAt ?? Date.now();
    const status = normalizeAdaptationStatus(input.status);
    const detail = { canonicalStatus: status, validationResults: current.adaptation.validationResults ?? [], appliedTo: current.adaptation.appliedTo ?? [], metadata: current.adaptation.metadata ?? {}, patchCount: current.adaptation.patch.length } satisfies JsonObject;
    await this.lease.database.run(
      "update adaptations set status = ?, approval_mode = ?, status_detail_json = ?, status_reason = ?, reviewed_at_ms = ?, updated_at_ms = ? where adaptation_id = ?",
      [dbStatus(status), input.approvalMode ?? current.approvalMode, JSON.stringify(detail), input.reason ?? statusReasonFor(status), reviewedAtFor(status, now), now, input.adaptationId]
    );
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: auditEventForStatus(status), actorId: input.actorId ?? null, fromStatus: current.status, toStatus: status, reason: input.reason ?? statusReasonFor(status), detail: { approvalMode: input.approvalMode ?? current.approvalMode }, createdAt: now });
    return this.mustGetAdaptation(input.adaptationId);
  }

  async appendAuditEvent(input: { adaptationId: string; eventType: AutomationStudioAdaptationAuditEventType; actorId?: string | null; fromStatus?: AutomationStudioStoredAdaptationStatus | null; toStatus?: AutomationStudioStoredAdaptationStatus | null; reason?: string; detail?: JsonObject; createdAt?: number }): Promise<AutomationStudioAdaptationAuditEvent> {
    const now = input.createdAt ?? Date.now();
    const eventId = `adaptation.audit.${input.adaptationId}.${now}.${randomUUID()}`;
    await this.lease.database.run("insert into adaptation_audit_events (event_id, adaptation_id, event_type, actor_id, from_status, to_status, reason, detail_json, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [eventId, requiredId(input.adaptationId, "adaptation"), input.eventType, input.actorId ?? null, input.fromStatus ?? null, input.toStatus ?? null, input.reason ?? "", JSON.stringify(input.detail ?? {}), now]);
    const row = await this.lease.database.get<AuditRow>("select * from adaptation_audit_events where event_id = ?", [eventId]);
    if (!row) throw new Error(`Adaptation audit event ${eventId} was not persisted.`);
    return auditFromRow(row);
  }

  private async updateStatusFields(adaptation: AutomationStudioFlowAdaptation, input: { rollbackObjectId?: string; appliedRevision?: number; appliedAt?: number; statusReason?: string }): Promise<void> {
    await this.lease.database.run(
      "update adaptations set status = ?, status_detail_json = ?, status_reason = ?, applied_revision = ?, rollback_object_id = ?, applied_at_ms = ?, updated_at_ms = ? where adaptation_id = ?",
      [dbStatus(adaptation.status), JSON.stringify({ canonicalStatus: adaptation.status, validationResults: adaptation.validationResults ?? [], appliedTo: adaptation.appliedTo ?? [], metadata: adaptation.metadata ?? {}, patchCount: adaptation.patch.length }), input.statusReason ?? "", input.appliedRevision ?? null, input.rollbackObjectId ?? null, input.appliedAt ?? null, adaptation.updatedAt, adaptation.adaptationId]
    );
  }

  private async compileAppliedRevision(flowId: string, revisionNumber: number, changedAt: number | undefined): Promise<AutomationStudioCompiledArtifactManifest> {
    const compiler = await AutomationStudioProjectCompiledPlanStore.open({ pool: this.pool, projectId: this.lease.projectId });
    try {
      return await compiler.compileFlowRevision({ flowId, flowRevision: revisionNumber, compilerVersion: AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION, ...(changedAt === undefined ? {} : { compiledAt: changedAt }) });
    } finally {
      await compiler.close();
    }
  }

  private async currentRevisionBindings(flowId: string): Promise<AutomationStudioAdaptationRevisionBindings> {
    const flow = await this.lease.database.get<{ graph_revision: number; settings_revision: number }>("select graph_revision, settings_revision from flows where flow_id = ?", [requiredId(flowId, "flow")]);
    if (!flow) throw new Error(`Unknown Flow: ${flowId}`);
    const router = await this.lease.database.get<{ revision: number }>("select revision from routers where flow_id = ?", [flowId]);
    const instruction = await this.lease.database.get<{ revision: number | null }>("select max(i.revision) as revision from instructions i left join instruction_scopes s on s.instruction_id = i.instruction_id where i.deleted_at_ms is null and (s.flow_id = ? or s.scope_kind in ('global', 'project'))", [flowId]);
    return { flowRevision: flow.graph_revision, routerRevision: router?.revision ?? null, settingsRevision: flow.settings_revision ?? null, instructionRevision: instruction?.revision ?? null };
  }

  private async writeArtifact(input: { adaptationId: string; kind: AutomationStudioStoredAdaptationArtifactKind; value: unknown; sequence: number; summary: string; createdAt: number }): Promise<WrittenArtifact> {
    const written = await this.content.putJson({ value: input.value, transactionId: `${input.adaptationId}.${input.kind}.${input.sequence}`, owner: { ownerKind: "adaptation", ownerId: input.adaptationId, purpose: input.kind }, createdAt: input.createdAt });
    return { artifactId: `adaptation.artifact.${input.adaptationId}.${input.kind}.${input.sequence}`, objectId: written.object.objectId, kind: input.kind, sequence: input.sequence, summary: input.summary, digest: written.object.sha256, createdAt: input.createdAt };
  }

  private async upsertArtifactRow(sql: AutomationStudioSqlExecutor, adaptationId: string, artifact: WrittenArtifact): Promise<void> {
    await sql.run(`insert into adaptation_artifacts (artifact_id, adaptation_id, artifact_kind, object_id, sequence, summary, digest, created_at_ms)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(artifact_id) do update set object_id = excluded.object_id, summary = excluded.summary, digest = excluded.digest`,
      [artifact.artifactId, adaptationId, artifact.kind, artifact.objectId, artifact.sequence, artifact.summary, artifact.digest, artifact.createdAt]
    );
  }

  private async adaptationFromRow(row: AdaptationRow): Promise<AutomationStudioFlowAdaptation> {
    const patch = await this.readArtifactJson(row.patch_object_id).catch(() => []);
    const evidence = row.evidence_object_id ? await this.readArtifactJson(row.evidence_object_id).catch(() => null) : null;
    const detail = object(row.status_detail_json);
    const metadata = objectValue(detail.metadata);
    const evidenceObject = objectValue(evidence);
    const observedState = jsonObjectProperty(evidenceObject, "observedState");
    const expectedState = jsonObjectProperty(evidenceObject, "expectedState");
    const failedAction = jsonObjectProperty(evidenceObject, "failedAction");
    const validationResults = Array.isArray(detail.validationResults) ? detail.validationResults as AutomationStudioFlowAdaptation["validationResults"] : undefined;
    const appliedTo = Array.isArray(detail.appliedTo) ? detail.appliedTo as AutomationStudioFlowAdaptation["appliedTo"] : undefined;
    return {
      schemaVersion: "0.1",
      adaptationId: row.adaptation_id,
      flowId: row.flow_id,
      projectId: this.lease.projectId,
      ...(row.subflow_id ? { subflowId: row.subflow_id } : {}),
      ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
      trigger: row.trigger,
      ...(observedState ? { observedState } : {}),
      ...(expectedState ? { expectedState } : {}),
      ...(failedAction ? { failedAction } : {}),
      ...(typeof metadata.diagnosis === "string" ? { diagnosis: metadata.diagnosis } : {}),
      patch: Array.isArray(patch) ? patch as AutomationStudioChangeProposalPatch[] : [],
      ...(validationResults ? { validationResults } : {}),
      ...(appliedTo ? { appliedTo } : {}),
      status: normalizeAdaptationStatus((detail.canonicalStatus as string | undefined) ?? row.status),
      author: row.author,
      riskLevel: row.risk_level,
      createdAt: row.created_at_ms,
      updatedAt: row.updated_at_ms,
      metadata: compact({ ...metadata, baseRevision: row.base_revision, proposedRevision: row.proposed_revision, ...(row.applied_revision === null ? {} : { appliedRevision: row.applied_revision }), ...(row.superseded_by_adaptation_id === null ? {} : { supersededByAdaptationId: row.superseded_by_adaptation_id }) })
    };
  }

  private async readArtifactJson(objectId: string): Promise<unknown> {
    const row = await this.lease.database.get<{ sha256: string }>("select sha256 from objects where object_id = ?", [objectId]);
    if (!row) throw new Error(`Unknown adaptation object: ${objectId}`);
    const asset = await this.content.readBytesBySha256(row.sha256);
    return JSON.parse(asset.content.toString("utf8")) as unknown;
  }
}

async function graphPatchOperationsForAdaptation(graph: AutomationStudioProjectGraphRepository, adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioGraphPatchOperation[]> {
  const operations: AutomationStudioGraphPatchOperation[] = [];
  for (const patch of adaptation.patch) {
    if (patch.kind === "edit_expectation" || patch.kind === "edit_action_target" || patch.kind === "edit_recovery") {
      if (!patch.targetId) throw new Error(`Patch ${patch.kind} requires a target node.`);
      const node = await graph.getNode(patch.targetId);
      if (!node) throw new Error(`Unknown node: ${patch.targetId}`);
      const values = { ...node.parameterValues };
      if (patch.kind === "edit_expectation") Object.assign(values, objectValue(patch.after));
      else if (patch.kind === "edit_action_target") values.target = patch.after as JsonValue;
      else values.recovery = { ...objectValue(values.recovery), ...objectValue(patch.after) };
      operations.push({ op: "set_node_parameters", nodeId: patch.targetId, values });
      continue;
    }
    const after = objectValue(patch.after);
    if (patch.kind === "edit_router" && typeof after.toNodeId === "string" && patch.targetId) {
      operations.push({ op: "add_edge", edge: { edgeId: `adaptation.${safeSegment(adaptation.adaptationId)}.${safeSegment(patch.targetId)}.${safeSegment(after.toNodeId)}`, flowId: adaptation.flowId, sourceNodeId: patch.targetId, targetNodeId: after.toNodeId, sourcePortId: "failed", targetPortId: "in", label: patch.summary, metadata: { adaptationId: adaptation.adaptationId } } });
      continue;
    }
    throw new Error(`Adaptation patch ${patch.kind} is not graph-transaction compatible yet.`);
  }
  if (!operations.length) throw new Error("Adaptation has no graph patch operations.");
  return operations;
}

function sectionItems(detail: AutomationStudioStoredAdaptationDetail, section: AutomationStudioAdaptationDetailSection["section"]): JsonValue[] {
  if (section === "summary") return [{ status: detail.status, trigger: detail.trigger, riskLevel: detail.riskLevel, approvalMode: detail.approvalMode, revisions: detail.revisions }];
  if (section === "changes") return detail.adaptation.patch as unknown as JsonValue[];
  if (section === "validation") return (detail.adaptation.validationResults ?? []) as unknown as JsonValue[];
  if (section === "evidence") return detail.artifacts.filter((artifact) => artifact.artifactKind === "prompt" || artifact.artifactKind === "response" || artifact.artifactKind === "evidence").map((artifact) => artifact as unknown as JsonValue);
  return [detail.adaptation as unknown as JsonValue];
}

function summaryFromRow(projectId: string, row: AdaptationRow): AutomationStudioAdaptationSummaryRecord {
  const detail = object(row.status_detail_json);
  return { adaptationId: row.adaptation_id, projectId, flowId: row.flow_id, subflowId: row.subflow_id, sourceRunId: row.source_run_id, status: normalizeAdaptationStatus((detail.canonicalStatus as string | undefined) ?? row.status), riskLevel: row.risk_level, approvalMode: row.approval_mode, trigger: row.trigger, baseRevision: row.base_revision, proposedRevision: row.proposed_revision, appliedRevision: row.applied_revision, author: row.author, patchCount: numberValue(detail.patchCount, 1), evidenceCount: row.evidence_object_id ? 1 : 0, promptObjectId: row.prompt_object_id, responseObjectId: row.response_object_id, patchObjectId: row.patch_object_id, evidenceObjectId: row.evidence_object_id, supersededByAdaptationId: row.superseded_by_adaptation_id, statusReason: row.status_reason, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, reviewedAt: row.reviewed_at_ms, appliedAt: row.applied_at_ms };
}

function artifactFromRow(row: ArtifactRow): AutomationStudioAdaptationArtifactRecord { return { artifactId: row.artifact_id, adaptationId: row.adaptation_id, artifactKind: row.artifact_kind, objectId: row.object_id, sequence: row.sequence, summary: row.summary, digest: row.digest, createdAt: row.created_at_ms }; }
function auditFromRow(row: AuditRow): AutomationStudioAdaptationAuditEvent { return { eventId: row.event_id, adaptationId: row.adaptation_id, eventType: row.event_type, actorId: row.actor_id, fromStatus: nullableStatus(row.from_status), toStatus: nullableStatus(row.to_status), reason: row.reason, detail: object(row.detail_json), detailObjectId: row.detail_object_id, createdAt: row.created_at_ms }; }
function revisionsFromRow(row: AdaptationRow): AutomationStudioAdaptationRevisionBindings { return { flowRevision: row.base_flow_revision ?? row.base_revision, routerRevision: row.base_router_revision, settingsRevision: row.base_settings_revision, instructionRevision: row.base_instruction_revision }; }
function adaptationOrder(sort: NonNullable<ListInput["sort"]>, direction: "asc" | "desc"): string { const dir = direction === "asc" ? "asc" : "desc"; if (sort === "status") return `order by status ${dir}, updated_at_ms ${dir}, adaptation_id ${dir}`; if (sort === "risk") return `order by risk_level ${dir}, updated_at_ms ${dir}, adaptation_id ${dir}`; if (sort === "trigger") return `order by trigger collate nocase ${dir}, adaptation_id ${dir}`; return `order by updated_at_ms ${dir}, adaptation_id ${dir}`; }
function approvalModeFromAdaptation(adaptation: AutomationStudioFlowAdaptation): AutomationStudioAdaptationApprovalMode { const value = adaptation.metadata?.approvalMode ?? adaptation.metadata?.proposalModeOverride; return value === "manual_approval" || value === "manual" ? "manual_approval" : value === "disabled" || value === "deterministic" ? "disabled" : "adaptive"; }
function dbStatus(status: AutomationStudioStoredAdaptationStatus): AdaptationDbStatus { if (status === "validated") return "approved"; if (status === "proposed") return "draft"; if (status === "testing") return "pending_approval"; if (status === "disabled" || status === "reverted" || status === "superseded") return "failed"; if (status === "applied" || status === "rejected") return status; return "failed"; }
function normalizeAdaptationStatus(value: string): AutomationStudioStoredAdaptationStatus { if (value === "approved") return "validated"; if (value === "draft" || value === "pending_approval") return "proposed"; if (["proposed", "testing", "validated", "applied", "rejected", "disabled", "reverted", "superseded"].includes(value)) return value as AutomationStudioStoredAdaptationStatus; return "rejected"; }
function nullableStatus(value: string | null): AutomationStudioStoredAdaptationStatus | null { return value ? normalizeAdaptationStatus(value) : null; }
function reviewedAtFor(status: AutomationStudioStoredAdaptationStatus, now: number): number | null { return status === "validated" || status === "rejected" || status === "disabled" || status === "superseded" ? now : null; }
function auditEventForStatus(status: AutomationStudioStoredAdaptationStatus): AutomationStudioAdaptationAuditEventType { if (status === "validated") return "approved"; if (status === "rejected") return "rejected"; if (status === "testing") return "validation_requested"; return "status_changed"; }
function statusReasonFor(status: AutomationStudioStoredAdaptationStatus): string { if (status === "validated") return "Adaptation approved for application."; if (status === "rejected") return "Adaptation rejected."; if (status === "testing") return "Validation requested."; if (status === "disabled") return "Adaptation disabled by policy."; if (status === "proposed") return "Adaptation queued for manual review."; return `Adaptation marked ${status}.`; }
function dbRisk(value: string): "low" | "medium" | "high" { return value === "medium" ? "medium" : value === "high" || value === "destructive" ? "high" : "low"; }
function object(value: string): JsonObject { try { return objectValue(JSON.parse(value) as unknown); } catch { return {}; } }
function objectValue(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function jsonObjectProperty(value: JsonObject, key: string): JsonObject | undefined { const next = objectValue(value[key]); return Object.keys(next).length ? next : undefined; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function numberValue(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function requiredId(value: string, label: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${label} ID.`); return id; }
function safeSegment(value: string): string { return requiredId(value, "path segment").replace(/:/g, "."); }
function positive(value: unknown, fallback: number): number { const next = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback; if (next < 1) throw new Error("Revision must be positive."); return next; }
function clamp(value: number | undefined, min: number, max: number, fallback: number): number { const next = Math.trunc(value ?? fallback); return Math.max(min, Math.min(max, Number.isFinite(next) ? next : fallback)); }
function compact(value: JsonObject): JsonObject { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject; }
export function automationStudioAdaptationDigest(value: unknown): string { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"; if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
