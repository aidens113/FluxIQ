import { createHash, randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioAdaptationRiskLevel, AutomationStudioChangeProposalPatch, AutomationStudioDeterministicPathNode, AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowChangeEntryPoint } from "../../model/index.ts";
import { parseAutomationStudioDeterministicPath, parseAutomationStudioFlowChangeOrigin, validateAutomationStudioFlowAdaptation } from "../../model/index.ts";
import { AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION } from "../../runtime/compiled-plan.ts";
import { actionTargetParameterValues, decideAutomationStudioChangeConfidence, withAutomationStudioNodeAdaptationId, type AutomationStudioChangeConfidence } from "../../runtime/flow-change/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";
import { AutomationStudioProjectCompiledPlanStore, type AutomationStudioCompiledArtifactManifest } from "./compiled-plan-store.ts";
import { AutomationStudioProjectContentStore } from "./content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./database.ts";
import { AutomationStudioProjectGraphRepository, automationStudioGraphPatchRequestDigest, type AutomationStudioGraphPatchApplied, type AutomationStudioGraphPatchOperation, type AutomationStudioGraphPatchResult } from "./graph-store.ts";
import { AutomationStudioSchemaMigrationRunner } from "../schema-migrations.ts";

export type AutomationStudioStoredAdaptationStatus = AutomationStudioFlowAdaptation["status"];
export type AutomationStudioStoredAdaptationArtifactKind = "patch" | "prompt" | "response" | "evidence" | "validation" | "rollback" | "audit";
export type AutomationStudioAdaptationApprovalMode = "adaptive" | "manual_approval" | "disabled";
export type AutomationStudioAdaptationAuditEventType = "created" | "status_changed" | "approved" | "rejected" | "applied" | "apply_failed" | "stale_base" | "rebased" | "superseded" | "rollback" | "policy_blocked" | "validation_requested";

export type AutomationStudioAdaptationRevisionBindings = { flowRevision: number; routerRevision: number | null; settingsRevision: number | null; instructionRevision: number | null };
export type AutomationStudioAdaptationArtifactRecord = { artifactId: string; adaptationId: string; artifactKind: AutomationStudioStoredAdaptationArtifactKind; objectId: string; sequence: number; summary: string; digest: string; createdAt: number };
export type AutomationStudioAdaptationSummaryRecord = { adaptationId: string; projectId: string; flowId: string; subflowId: string | null; sourceRunId: string | null; status: AutomationStudioStoredAdaptationStatus; riskLevel: AutomationStudioFlowAdaptation["riskLevel"]; approvalMode: AutomationStudioAdaptationApprovalMode; trigger: string; baseRevision: number; proposedRevision: number; appliedRevision: number | null; author: AutomationStudioFlowAdaptation["author"]; patchCount: number; evidenceCount: number; promptObjectId: string | null; responseObjectId: string | null; patchObjectId: string; evidenceObjectId: string | null; supersededByAdaptationId: string | null; statusReason: string; createdAt: number; updatedAt: number; reviewedAt: number | null; appliedAt: number | null; failureSignature: string | null; confidenceTier: AutomationStudioChangeConfidence | null; originEntryPoint: AutomationStudioFlowChangeEntryPoint | null };
export type AutomationStudioAdaptationAuditEvent = { eventId: string; adaptationId: string; eventType: AutomationStudioAdaptationAuditEventType; actorId: string | null; fromStatus: AutomationStudioStoredAdaptationStatus | null; toStatus: AutomationStudioStoredAdaptationStatus | null; reason: string; detail: JsonObject; detailObjectId: string | null; createdAt: number };
export type AutomationStudioAdaptationDetailSection = { adaptationId: string; section: "summary" | "changes" | "evidence" | "validation" | "audit" | "raw"; items: JsonValue[]; total: number; limit: number; offset: number };
export type AutomationStudioStoredAdaptationDetail = AutomationStudioAdaptationSummaryRecord & { adaptation: AutomationStudioFlowAdaptation; revisions: AutomationStudioAdaptationRevisionBindings; artifacts: AutomationStudioAdaptationArtifactRecord[] };
export type AutomationStudioAppliedAdaptationResult = { adaptation: AutomationStudioStoredAdaptationDetail; patch: AutomationStudioGraphPatchResult; compiledArtifact: AutomationStudioCompiledArtifactManifest | null; auditEvent: AutomationStudioAdaptationAuditEvent };
/**
 * The promotion gates every apply path runs: whether a change may be applied,
 * and why not. The caller passes `evaluateFlowAdaptationPromotionGates`. The
 * store cannot import it: it lives in `runtime/recovery`, whose imports reach
 * `runtime/service` and, through it, this store, so an import here would close
 * a module cycle. The store refuses to apply without it.
 */
export type AutomationStudioAdaptationPromotionGates = (adaptation: AutomationStudioFlowAdaptation) => { ok: boolean; issues: string[] };

type ListInput = { flowId?: string; subflowId?: string; status?: string; risk?: string; failureSignature?: string; confidenceTier?: AutomationStudioChangeConfidence; search?: string; sort?: "updated" | "status" | "risk" | "trigger"; direction?: "asc" | "desc"; limit?: number; offset?: number };
type WrittenArtifact = { artifactId: string; objectId: string; kind: AutomationStudioStoredAdaptationArtifactKind; sequence: number; summary: string; digest: string; createdAt: number };
type AdaptationDbStatus = "draft" | "pending_approval" | "approved" | "applied" | "rejected" | "failed";
type AdaptationRow = { adaptation_id: string; flow_id: string; subflow_id: string | null; base_revision: number; proposed_revision: number; trigger: string; status: AdaptationDbStatus; risk_level: AutomationStudioFlowAdaptation["riskLevel"]; approval_mode: AutomationStudioAdaptationApprovalMode; patch_object_id: string; evidence_object_id: string | null; created_at_ms: number; updated_at_ms: number; reviewed_at_ms: number | null; applied_at_ms: number | null; source_run_id: string | null; author: AutomationStudioFlowAdaptation["author"]; status_reason: string; status_detail_json: string; base_flow_revision: number | null; base_router_revision: number | null; base_settings_revision: number | null; base_instruction_revision: number | null; applied_revision: number | null; prompt_object_id: string | null; response_object_id: string | null; rollback_object_id: string | null; audit_object_id: string | null; patch_digest: string; evidence_digest: string; superseded_by_adaptation_id: string | null; failure_signature: string | null; confidence_tier: AutomationStudioChangeConfidence | null; origin_entry_point: AutomationStudioFlowChangeEntryPoint | null };
type AdaptationMatchingColumns = { failureSignature: string | null; confidenceTier: AutomationStudioChangeConfidence; originEntryPoint: AutomationStudioFlowChangeEntryPoint | null };
// What the promotion gates decided, with the refusal worded as every apply path words it.
type PromotionGateVerdict = { ok: true } | { ok: false; reason: string };
type ArtifactRow = { artifact_id: string; adaptation_id: string; artifact_kind: AutomationStudioStoredAdaptationArtifactKind; object_id: string; sequence: number; summary: string; digest: string; created_at_ms: number };
type AuditRow = { event_id: string; adaptation_id: string; event_type: AutomationStudioAdaptationAuditEventType; actor_id: string | null; from_status: string | null; to_status: string | null; reason: string; detail_object_id: string | null; detail_json: string; created_at_ms: number };

export class AutomationStudioProjectAdaptationStore {
  private constructor(private readonly pool: AutomationStudioProjectDatabasePool, private readonly lease: AutomationStudioProjectDatabaseLease, private readonly content: AutomationStudioProjectContentStore) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectAdaptationStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      await mapUnmappedAdaptations(lease.database);
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
    const graphTarget = await this.graphTransactionTarget(input.adaptation);
    const revisions = await this.currentRevisionBindings(input.adaptation);
    const declaredGraphTarget = stringValue(input.adaptation.metadata?.graphRevisionTargetFlowId);
    const baseRevision = input.adaptation.subflowId && declaredGraphTarget !== graphTarget.flowId
      ? revisions.flowRevision
      : positive(input.adaptation.metadata?.baseRevision, revisions.flowRevision);
    const adaptation: AutomationStudioFlowAdaptation = {
      ...input.adaptation,
      metadata: compact({ ...(input.adaptation.metadata ?? {}), baseRevision, graphRevisionTargetFlowId: graphTarget.flowId })
    };
    const status = normalizeAdaptationStatus(adaptation.status);
    const approvalMode = input.approvalMode ?? approvalModeFromAdaptation(adaptation);
    const patchWrite = await this.writeArtifact({ adaptationId: adaptation.adaptationId, kind: "patch", value: adaptation.patch, sequence: 0, summary: `${adaptation.patch.length} changes`, createdAt: now });
    const promptWrite = input.prompt === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "prompt", value: input.prompt, sequence: 0, summary: "LLM prompt", createdAt: now });
    const responseWrite = input.response === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "response", value: input.response, sequence: 0, summary: "LLM response", createdAt: now });
    const evidenceWrite = input.evidence === undefined ? null : await this.writeArtifact({ adaptationId: input.adaptation.adaptationId, kind: "evidence", value: input.evidence, sequence: 0, summary: "Runtime evidence", createdAt: now });
    const statusDetail = adaptationStatusDetail(adaptation, status);
    await this.lease.database.transaction(async (sql) => {
      await sql.run(`insert into adaptations (adaptation_id, flow_id, subflow_id, base_revision, proposed_revision, trigger, status, risk_level, approval_mode, patch_object_id, evidence_object_id, created_at_ms, updated_at_ms, reviewed_at_ms, applied_at_ms, source_run_id, author, status_reason, status_detail_json, base_flow_revision, base_router_revision, base_settings_revision, base_instruction_revision, applied_revision, prompt_object_id, response_object_id, rollback_object_id, audit_object_id, patch_digest, evidence_digest, superseded_by_adaptation_id, failure_signature, confidence_tier, origin_entry_point)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(adaptation_id) do update set failure_signature = excluded.failure_signature, confidence_tier = excluded.confidence_tier, origin_entry_point = excluded.origin_entry_point, subflow_id = excluded.subflow_id, base_revision = excluded.base_revision, proposed_revision = excluded.proposed_revision, trigger = excluded.trigger, status = excluded.status, risk_level = excluded.risk_level, approval_mode = excluded.approval_mode, patch_object_id = excluded.patch_object_id, evidence_object_id = excluded.evidence_object_id, updated_at_ms = excluded.updated_at_ms, reviewed_at_ms = excluded.reviewed_at_ms, applied_at_ms = excluded.applied_at_ms, source_run_id = excluded.source_run_id, author = excluded.author, status_reason = excluded.status_reason, status_detail_json = excluded.status_detail_json, base_flow_revision = excluded.base_flow_revision, base_router_revision = excluded.base_router_revision, base_settings_revision = excluded.base_settings_revision, base_instruction_revision = excluded.base_instruction_revision, applied_revision = excluded.applied_revision, prompt_object_id = coalesce(excluded.prompt_object_id, adaptations.prompt_object_id), response_object_id = coalesce(excluded.response_object_id, adaptations.response_object_id), patch_digest = excluded.patch_digest, evidence_digest = excluded.evidence_digest, superseded_by_adaptation_id = excluded.superseded_by_adaptation_id`,
        [adaptation.adaptationId, adaptation.flowId, adaptation.subflowId ?? null, baseRevision, positive(adaptation.metadata?.proposedRevision, baseRevision + 1), adaptation.trigger, dbStatus(status), dbRisk(adaptation.riskLevel), approvalMode, patchWrite.objectId, evidenceWrite?.objectId ?? null, adaptation.createdAt, now, reviewedAtFor(status, now), status === "applied" ? now : null, adaptation.sourceRunId ?? null, adaptation.author, input.statusReason ?? "", JSON.stringify(statusDetail), baseRevision, revisions.routerRevision, revisions.settingsRevision, revisions.instructionRevision, status === "applied" ? positive(adaptation.metadata?.appliedRevision, baseRevision) : null, promptWrite?.objectId ?? null, responseWrite?.objectId ?? null, null, null, patchWrite.digest, evidenceWrite?.digest ?? "", stringValue(adaptation.metadata?.supersededByAdaptationId) ?? null, ...matchingParams(adaptation)]
      );
      for (const artifact of [patchWrite, promptWrite, responseWrite, evidenceWrite].filter((item): item is WrittenArtifact => Boolean(item))) await this.upsertArtifactRow(sql, adaptation.adaptationId, artifact);
    });
    await this.appendAuditEvent({ adaptationId: adaptation.adaptationId, eventType: "created", actorId: input.actorId ?? adaptation.author, toStatus: status, reason: input.statusReason ?? "Adaptation recorded.", detail: { approvalMode, revisions, graphTargetFlowId: graphTarget.flowId }, createdAt: now });
    return this.mustGetAdaptation(adaptation.adaptationId);
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
    if (input.failureSignature) { clauses.push("failure_signature = ?"); params.push(input.failureSignature); }
    if (input.confidenceTier !== undefined) { clauses.push("confidence_tier = ?"); params.push(confidenceTierValue(input.confidenceTier)); }
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

  async supportsGraphTransaction(adaptation: AutomationStudioFlowAdaptation): Promise<boolean> {
    if (!isGraphTransactionCompatibleAdaptation(adaptation)) return false;
    const target = await this.graphTransactionTarget(adaptation);
    const revision = await this.lease.database.get<{ revision_number: number }>(
      "select revision_number from graph_revisions where flow_id = ? order by revision_number desc limit 1",
      [target.flowId]
    );
    return revision !== undefined;
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

  /**
   * Whether the approval mode lets this action happen. Applying also needs the
   * promotion gates' pass, and anything short of one refuses it.
   */
  decidePolicy(input: { approvalMode: AutomationStudioAdaptationApprovalMode; action: "create" | "apply" | "auto_apply"; gates?: PromotionGateVerdict }): { ok: boolean; autoApply: boolean; requiresManualApproval: boolean; reason: string; compileRequired: boolean } {
    if (input.approvalMode === "disabled") return { ok: false, autoApply: false, requiresManualApproval: false, compileRequired: false, reason: "No LLM intervention policy blocks adaptation creation and application." };
    if (input.action === "auto_apply" && input.approvalMode === "manual_approval") return { ok: false, autoApply: false, requiresManualApproval: true, compileRequired: true, reason: "Manual approval policy blocks automatic adaptation application." };
    if (input.action !== "create" && input.gates?.ok !== true) return { ok: false, autoApply: false, requiresManualApproval: true, compileRequired: true, reason: input.gates?.ok === false ? input.gates.reason : gateRefusal("its promotion gates were not supplied.") };
    return { ok: true, autoApply: input.action === "auto_apply" && input.approvalMode === "adaptive", requiresManualApproval: input.approvalMode === "manual_approval", compileRequired: input.action !== "create", reason: input.approvalMode === "adaptive" ? "Fully adaptive policy allows validated graph-safe application." : "Manual policy allows explicit reviewer application." };
  }

  async applyApprovedAdaptation(input: { adaptationId: string; actorId?: string; mutationId?: string; changedAt?: number; compile?: boolean; promotionGates: AutomationStudioAdaptationPromotionGates }): Promise<AutomationStudioAppliedAdaptationResult> {
    const detail = await this.mustGetAdaptation(input.adaptationId);
    // The same gates as every other apply path, on the change as stored: only a
    // succeeded trial or replay, or a named reviewer's approval, is evidence,
    // and the confidence tier decides. A `validated` status is a claim, not
    // evidence that anything ran and was compared, or that anybody looked.
    const gates = await this.promotionGateVerdict(input.promotionGates, detail.adaptation);
    const policy = this.decidePolicy({ approvalMode: detail.approvalMode, gates, action: input.actorId === "runtime" ? "auto_apply" : "apply" });
    if (!policy.ok) {
      await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "policy_blocked", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: detail.status, reason: policy.reason, detail: { policy }, createdAt: input.changedAt ?? Date.now() });
      throw new Error(policy.reason);
    }
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.pool, projectId: this.lease.projectId });
    try {
      const target = await this.graphTransactionTarget(detail.adaptation);
      const baseRevision = await this.graphTransactionBaseRevision(detail, target.flowId);
      const mutationId = input.mutationId ?? adaptationGraphMutationId("apply", detail.adaptation, target.flowId);
      const existingMutation = await this.lease.database.get<{ status: string; request_digest: string }>("select status, request_digest from mutation_records where mutation_id = ?", [mutationId]);
      const currentRevision = await graph.getFlowRevision(target.flowId);
      if (currentRevision !== baseRevision && existingMutation?.status !== "committed") {
        await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "stale_base", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: detail.status, reason: `Flow is at revision ${currentRevision}; adaptation base is ${baseRevision}.`, detail: { currentRevision, baseRevision, graphTargetFlowId: target.flowId }, createdAt: input.changedAt ?? Date.now() });
        throw new Error(`Adaptation ${detail.adaptationId} has a stale base revision.`);
      }
      const request = { flowId: target.flowId, baseRevision, authorId: input.actorId ?? "adaptation", message: `Apply adaptation ${detail.adaptationId}` };
      const operations = operationsForCommittedApply(await graphPatchOperationsForAdaptation(graph, detail.adaptation, target.flowId), existingMutation, request);
      const patched = await graph.applyPatch({ pool: this.pool, projectId: this.lease.projectId, mutationId, operations, ...request, ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) });
      if (patched.response.status !== "applied") throw new Error(`Adaptation ${detail.adaptationId} could not apply cleanly.`);
      const applied = patched.response as AutomationStudioGraphPatchApplied;
      const compiledArtifact = input.compile === false ? null : await this.compileAppliedRevision(target.flowId, applied.revisionNumber, input.changedAt);
      const rollback = await this.writeArtifact({ adaptationId: detail.adaptationId, kind: "rollback", value: applied.inverseOperations, sequence: 0, summary: "Inverse graph patch", createdAt: input.changedAt ?? Date.now() });
      await this.upsertArtifactRow(this.lease.database, detail.adaptationId, rollback);
      const nextAdaptation: AutomationStudioFlowAdaptation = { ...detail.adaptation, status: "applied", updatedAt: input.changedAt ?? Date.now(), appliedTo: appliedTargets(applied.changedEntities), metadata: compact({ ...(detail.adaptation.metadata ?? {}), baseRevision, graphRevisionTargetFlowId: target.flowId, appliedRevision: applied.revisionNumber, ...(applied.validationJobId ? { validationJobId: applied.validationJobId } : {}), ...(compiledArtifact ? { compiledArtifactId: compiledArtifact.artifactId } : {}), graphPatchMutationId: patched.mutationId }) };
      await this.updateStatusFields(nextAdaptation, { rollbackObjectId: rollback.objectId, appliedRevision: applied.revisionNumber, appliedAt: nextAdaptation.updatedAt, statusReason: policy.reason });
      const auditEvent = await this.appendAuditEvent({ adaptationId: detail.adaptationId, eventType: "applied", actorId: input.actorId ?? null, fromStatus: detail.status, toStatus: "applied", reason: policy.reason, detail: compact({ graphTargetFlowId: target.flowId, revisionNumber: applied.revisionNumber, changedEntities: applied.changedEntities as unknown as JsonValue, ...(compiledArtifact ? { compiledArtifactId: compiledArtifact.artifactId } : {}) }), createdAt: nextAdaptation.updatedAt });
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
    await this.lease.database.run(`update adaptations set status = 'failed', status_detail_json = ?, status_reason = ?, superseded_by_adaptation_id = ?, updated_at_ms = ?, ${MATCHING_ASSIGNMENTS} where adaptation_id = ?`, [JSON.stringify(adaptationStatusDetail(current.adaptation, "superseded")), input.reason ?? "Superseded by a newer adaptation.", input.supersededByAdaptationId, now, ...matchingParams(current.adaptation), input.adaptationId]);
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: "superseded", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: "superseded", reason: input.reason ?? "Superseded by a newer adaptation.", detail: { supersededByAdaptationId: input.supersededByAdaptationId }, createdAt: now });
    return this.mustGetAdaptation(input.adaptationId);
  }

  async rebaseAdaptation(input: { adaptationId: string; actorId?: string; reason?: string; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    const target = await this.graphTransactionTarget(current.adaptation);
    const revisions = await this.currentRevisionBindings(current.adaptation);
    const now = input.changedAt ?? Date.now();
    const metadata = compact({ ...(current.adaptation.metadata ?? {}), previousBaseRevision: current.baseRevision, graphRevisionTargetFlowId: target.flowId, baseRevision: revisions.flowRevision, rebasedAt: now });
    const rebased = { ...current.adaptation, metadata };
    const detail = adaptationStatusDetail(rebased, current.status);
    await this.lease.database.run(
      `update adaptations set base_revision = ?, proposed_revision = ?, base_flow_revision = ?, base_router_revision = ?, base_settings_revision = ?, base_instruction_revision = ?, status_detail_json = ?, status_reason = ?, updated_at_ms = ?, ${MATCHING_ASSIGNMENTS} where adaptation_id = ?`,
      [revisions.flowRevision, revisions.flowRevision + 1, revisions.flowRevision, revisions.routerRevision, revisions.settingsRevision, revisions.instructionRevision, JSON.stringify(detail), input.reason ?? "Rebased onto current Flow revisions.", now, ...matchingParams(rebased), input.adaptationId]
    );
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: "rebased", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: current.status, reason: input.reason ?? "Rebased onto current Flow revisions.", detail: { previous: current.revisions, next: revisions, graphTargetFlowId: target.flowId }, createdAt: now });
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
      const target = await this.graphTransactionTarget(current.adaptation);
      const baseRevision = await graph.getFlowRevision(target.flowId);
      const patched = await graph.applyPatch({ pool: this.pool, projectId: this.lease.projectId, flowId: target.flowId, baseRevision, mutationId: input.mutationId ?? adaptationGraphMutationId("rollback", current.adaptation, target.flowId), operations: rollback as AutomationStudioGraphPatchOperation[], authorId: input.actorId ?? "adaptation", message: input.reason ?? `Rollback adaptation ${current.adaptationId}`, changedAt: now });
      if (patched.response.status !== "applied") throw new Error(`Adaptation ${current.adaptationId} rollback could not apply cleanly.`);
      const reverted = { ...current.adaptation, metadata: compact({ ...(current.adaptation.metadata ?? {}), rollbackRevision: patched.response.revisionNumber, rollbackMutationId: patched.mutationId }) };
      await this.lease.database.run(`update adaptations set status = 'failed', status_detail_json = ?, status_reason = ?, updated_at_ms = ?, ${MATCHING_ASSIGNMENTS} where adaptation_id = ?`, [JSON.stringify(adaptationStatusDetail(reverted, "reverted")), input.reason ?? "Applied stored rollback graph patch.", now, ...matchingParams(reverted), current.adaptationId]);
      const auditEvent = await this.appendAuditEvent({ adaptationId: current.adaptationId, eventType: "rollback", actorId: input.actorId ?? null, fromStatus: current.status, toStatus: "reverted", reason: input.reason ?? "Applied stored rollback graph patch.", detail: { graphTargetFlowId: target.flowId, baseRevision, rollbackRevision: patched.response.revisionNumber }, createdAt: now });
      return { adaptation: await this.mustGetAdaptation(current.adaptationId), patch: patched.response, auditEvent };
    } finally {
      await graph.close();
    }
  }

  async setAdaptationStatus(input: { adaptationId: string; status: AutomationStudioStoredAdaptationStatus; approvalMode?: AutomationStudioAdaptationApprovalMode; actorId?: string; reason?: string; metadata?: JsonObject; changedAt?: number }): Promise<AutomationStudioStoredAdaptationDetail> {
    const current = await this.mustGetAdaptation(input.adaptationId);
    const now = input.changedAt ?? Date.now();
    const status = normalizeAdaptationStatus(input.status);
    // A status change may carry durable evidence of who made it, so that later
    // gates read a record rather than inferring one from the status.
    const adaptation = input.metadata
      ? { ...current.adaptation, metadata: { ...(current.adaptation.metadata ?? {}), ...input.metadata } }
      : current.adaptation;
    const detail = adaptationStatusDetail(adaptation, status);
    await this.lease.database.run(
      `update adaptations set status = ?, approval_mode = ?, status_detail_json = ?, status_reason = ?, reviewed_at_ms = ?, updated_at_ms = ?, ${MATCHING_ASSIGNMENTS} where adaptation_id = ?`,
      [dbStatus(status), input.approvalMode ?? current.approvalMode, JSON.stringify(detail), input.reason ?? statusReasonFor(status), reviewedAtFor(status, now), now, ...matchingParams(adaptation), input.adaptationId]
    );
    await this.appendAuditEvent({ adaptationId: input.adaptationId, eventType: auditEventForStatus(status), actorId: input.actorId ?? null, fromStatus: current.status, toStatus: status, reason: input.reason ?? statusReasonFor(status), detail: { approvalMode: input.approvalMode ?? current.approvalMode }, createdAt: now });
    return this.mustGetAdaptation(input.adaptationId);
  }

  /**
   * What the caller's promotion gates decide about the change as stored. Missing
   * gates, gates that throw, and anything but a consistent verdict all refuse.
   */
  private async promotionGateVerdict(promotionGates: unknown, adaptation: AutomationStudioFlowAdaptation): Promise<PromotionGateVerdict> {
    if (typeof promotionGates !== "function") return { ok: false, reason: gateRefusal("its promotion gates were not supplied.") };
    const judged = await this.withAuditedReviewer(adaptation);
    let verdict: unknown;
    try {
      verdict = (promotionGates as AutomationStudioAdaptationPromotionGates)(judged);
    } catch (error) {
      return { ok: false, reason: gateRefusal(`its promotion gates could not be evaluated (${error instanceof Error ? error.message : String(error)}).`) };
    }
    return promotionGateVerdictFrom(verdict);
  }

  /**
   * The change with its reviewer, for the gates, which read the reviewer from
   * `metadata.review.approvedBy`. A change approved before it carried one has
   * only the store's audit trail, so the latest named approval there is handed
   * over in that field. Nothing is written.
   */
  private async withAuditedReviewer(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation> {
    const review = objectValue(adaptation.metadata?.review);
    if (stringValue(review.approvedBy)) return adaptation;
    const row = await this.lease.database.get<{ actor_id: string }>(
      "select actor_id from adaptation_audit_events where adaptation_id = ? and event_type = 'approved' and actor_id is not null and trim(actor_id) not in ('', 'runtime') order by created_at_ms desc, event_id desc limit 1",
      [requiredId(adaptation.adaptationId, "adaptation")]
    );
    if (!row) return adaptation;
    return { ...adaptation, metadata: { ...(adaptation.metadata ?? {}), review: { ...review, approvedBy: row.actor_id } } };
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
      `update adaptations set status = ?, status_detail_json = ?, status_reason = ?, applied_revision = ?, rollback_object_id = ?, applied_at_ms = ?, updated_at_ms = ?, ${MATCHING_ASSIGNMENTS} where adaptation_id = ?`,
      [dbStatus(adaptation.status), JSON.stringify(adaptationStatusDetail(adaptation)), input.statusReason ?? "", input.appliedRevision ?? null, input.rollbackObjectId ?? null, input.appliedAt ?? null, adaptation.updatedAt, ...matchingParams(adaptation), adaptation.adaptationId]
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

  private async currentRevisionBindings(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioAdaptationRevisionBindings> {
    const target = await this.graphTransactionTarget(adaptation);
    const flow = await this.lease.database.get<{ graph_revision: number }>("select graph_revision from flows where flow_id = ?", [target.flowId]);
    if (!flow) throw new Error(`Unknown Flow: ${target.flowId}`);
    const parent = await this.lease.database.get<{ settings_revision: number }>("select settings_revision from flows where flow_id = ?", [requiredId(adaptation.flowId, "flow")]);
    if (!parent) throw new Error(`Unknown Flow: ${adaptation.flowId}`);
    const router = await this.lease.database.get<{ revision: number }>("select revision from routers where flow_id = ?", [adaptation.flowId]);
    const instruction = await this.lease.database.get<{ revision: number | null }>("select max(i.revision) as revision from instructions i left join instruction_scopes s on s.instruction_id = i.instruction_id where i.deleted_at_ms is null and (s.flow_id = ? or s.scope_kind in ('global', 'project'))", [adaptation.flowId]);
    return { flowRevision: flow.graph_revision, routerRevision: router?.revision ?? null, settingsRevision: parent.settings_revision ?? null, instructionRevision: instruction?.revision ?? null };
  }

  private async graphTransactionTarget(adaptation: AutomationStudioFlowAdaptation): Promise<{ flowId: string }> {
    const parentFlowId = requiredId(adaptation.flowId, "flow");
    const subflowId = stringValue(adaptation.subflowId);
    if (!subflowId) return { flowId: parentFlowId };
    const owned = await this.lease.database.get<{ graph_flow_id: string }>(
      "select graph_flow_id from subflows where subflow_id = ? and parent_flow_id = ? and deleted_at_ms is null",
      [requiredId(subflowId, "subflow"), parentFlowId]
    );
    if (!owned) throw new Error(`Subflow ${subflowId} is not owned by orchestration Flow ${parentFlowId}; adaptation refused.`);
    return { flowId: requiredId(owned.graph_flow_id, "Subflow graph Flow") };
  }

  private async graphTransactionBaseRevision(detail: AutomationStudioStoredAdaptationDetail, targetFlowId: string): Promise<number> {
    if (!detail.adaptation.subflowId || stringValue(detail.adaptation.metadata?.graphRevisionTargetFlowId) === targetFlowId) return detail.baseRevision;
    const historical = await this.lease.database.get<{ revision_number: number }>(
      "select revision_number from graph_revisions where flow_id = ? and created_at_ms <= ? order by revision_number desc limit 1",
      [targetFlowId, detail.createdAt]
    );
    if (!historical) throw new Error(`Adaptation ${detail.adaptationId} has no recoverable Subflow graph base revision.`);
    return historical.revision_number;
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
    const patch = await this.readArtifactJson(row.patch_object_id);
    if (!Array.isArray(patch)) throw new Error(`Adaptation ${row.adaptation_id} patch object is invalid.`);
    const evidence = row.evidence_object_id ? await this.readArtifactJson(row.evidence_object_id) : null;
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
      ...(typeof detail.proposalId === "string" && detail.proposalId ? { proposalId: detail.proposalId } : {}),
      trigger: row.trigger,
      ...(observedState ? { observedState } : {}),
      ...(expectedState ? { expectedState } : {}),
      ...(failedAction ? { failedAction } : {}),
      ...(typeof metadata.diagnosis === "string" ? { diagnosis: metadata.diagnosis } : {}),
      patch: patch as AutomationStudioChangeProposalPatch[],
      ...(validationResults ? { validationResults } : {}),
      ...(appliedTo ? { appliedTo } : {}),
      status: normalizeAdaptationStatus((detail.canonicalStatus as string | undefined) ?? row.status),
      author: row.author,
      riskLevel: detail.canonicalRiskLevel === "destructive" ? "destructive" : row.risk_level,
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

async function graphPatchOperationsForAdaptation(graph: AutomationStudioProjectGraphRepository, adaptation: AutomationStudioFlowAdaptation, targetFlowId: string): Promise<AutomationStudioGraphPatchOperation[]> {
  const operations: AutomationStudioGraphPatchOperation[] = [];
  // Each node whose record a patch writes, with the metadata it had before the change.
  const writtenNodes = new Map<string, JsonObject>();
  for (const patch of adaptation.patch) {
    // `edit_recovery` has no durable form. It used to be applied here by writing
    // a `recovery` key into the target node's parameters, but no node definition
    // declares that parameter and nothing in the executor reads it: the Flow ran
    // exactly as before while the adaptation was recorded as applied. Refusing it
    // is what stops a repair that never happened from reading as a success.
    if (patch.kind === "edit_recovery") throw new Error(`Adaptation patch edit_recovery has no durable application; ${adaptation.adaptationId} refused.`);
    // The durable form a learned recovery does have: real nodes inserted into
    // this graph and wired from the failed node's `failed` port, so the next run
    // reaches them through the recovery ladder's `deterministic_path` candidate.
    if (patch.kind === "insert_deterministic_path") {
      operations.push(...await deterministicPathOperations(graph, adaptation, targetFlowId, patch));
      continue;
    }
    // The other wiring the same node list takes: steps the Flow never had, on
    // the path a run already takes, ahead of the node they must run before.
    if (patch.kind === "edit_expectation" || patch.kind === "edit_action_target") {
      if (!patch.targetId) throw new Error(`Patch ${patch.kind} requires a target node.`);
      const node = await graph.getNode(patch.targetId);
      if (!node || node.flowId !== targetFlowId || node.deletedAt !== null) throw new Error(`Unknown node: ${patch.targetId}`);
      const values = { ...node.parameterValues };
      if (patch.kind === "edit_expectation") Object.assign(values, objectValue(patch.after));
      else Object.assign(values, actionTargetParameterValues(node, patch.after, adaptation.adaptationId));
      // The whole value map is written, so the inverse restores it exactly.
      operations.push({ op: "set_node_parameters", nodeId: patch.targetId, values });
      if (!writtenNodes.has(node.nodeId)) writtenNodes.set(node.nodeId, node.metadata);
      continue;
    }
    const after = objectValue(patch.after);
    if (patch.kind === "edit_router" && typeof after.toNodeId === "string" && patch.targetId) {
      operations.push({ op: "add_edge", edge: { edgeId: `adaptation.${safeSegment(adaptation.adaptationId)}.${safeSegment(patch.targetId)}.${safeSegment(after.toNodeId)}`, flowId: targetFlowId, sourceNodeId: patch.targetId, targetNodeId: after.toNodeId, sourcePortId: "failed", targetPortId: "in", label: patch.summary, metadata: { adaptationId: adaptation.adaptationId } } });
      continue;
    }
    throw new Error(`Adaptation patch ${patch.kind} is not graph-transaction compatible yet.`);
  }
  if (!operations.length) throw new Error("Adaptation has no graph patch operations.");
  // Provenance: every node the change writes lists the change once, so a later
  // run's attempts name the adaptations they exercised. A route-only change
  // writes an edge, which already names the adaptation, and stamps no node:
  // every run of the edge's source would otherwise claim the route. The stamp's
  // inverse restores the node's previous metadata, so a rollback removes it.
  for (const [nodeId, metadata] of writtenNodes) operations.push({ op: "set_node_metadata", nodeId, metadata: withAutomationStudioNodeAdaptationId(metadata, adaptation.adaptationId) });
  return operations;
}

/** Where an inserted recovery step sits relative to the node whose failure it handles. */
const DETERMINISTIC_PATH_X_OFFSET = 320;
const DETERMINISTIC_PATH_Y_OFFSET = 160;
/** The definition version an inserted node carries when the patch names none. */
const DETERMINISTIC_PATH_DEFINITION_VERSION = "1.0.0";

/**
 * The graph operations that insert one learned recovery path and wire it in.
 *
 * Both halves are one request to the transactional store, so a rejected patch
 * leaves the graph untouched and an applied one has a single inverse. The
 * inverse the store builds for an `add_node` is a `delete_node`, which cascades
 * to every edge on that node and restores each of them by `add_edge`; the
 * inverse for an `add_edge` is a `delete_edge`. Rolling this change back
 * therefore removes the path and whatever was later attached to it, and
 * re-applying the rollback's own inverse puts the cascaded edges back.
 *
 * Refusals, all of them before any operation reaches the store:
 * - no failed node named, or a node that is not live in this graph;
 * - an `after` value that is not a readable path;
 * - a rejoin node that is not live in this graph;
 * - a node id already in use, because `add_node` replaces a live node of the
 *   same id and would overwrite real behaviour rather than insert a step.
 */
async function deterministicPathOperations(
  graph: AutomationStudioProjectGraphRepository,
  adaptation: AutomationStudioFlowAdaptation,
  targetFlowId: string,
  patch: AutomationStudioChangeProposalPatch
): Promise<AutomationStudioGraphPatchOperation[]> {
  const failedNodeId = stringValue(patch.targetId);
  if (!failedNodeId) throw new Error(`Patch insert_deterministic_path requires the node whose failure it recovers; ${adaptation.adaptationId} refused.`);
  const path = parseAutomationStudioDeterministicPath(patch.after);
  if (!path) throw new Error(`Patch insert_deterministic_path for ${failedNodeId} does not carry a readable recovery path; ${adaptation.adaptationId} refused.`);
  const failed = await liveGraphNode(graph, failedNodeId, targetFlowId);
  if (!failed) throw new Error(`Unknown node: ${failedNodeId}`);
  if (path.returnToNodeId && !await liveGraphNode(graph, path.returnToNodeId, targetFlowId)) {
    throw new Error(`Deterministic path rejoins unknown node ${path.returnToNodeId}; ${adaptation.adaptationId} refused.`);
  }
  const operations: AutomationStudioGraphPatchOperation[] = [];
  for (const [index, node] of path.nodes.entries()) {
    if (await liveGraphNode(graph, node.nodeId, targetFlowId)) throw new Error(`Deterministic path node ${node.nodeId} already exists; ${adaptation.adaptationId} refused.`);
    operations.push({
      op: "add_node",
      node: {
        nodeId: node.nodeId,
        flowId: targetFlowId,
        definitionId: node.definitionId,
        definitionVersion: node.definitionVersion ?? DETERMINISTIC_PATH_DEFINITION_VERSION,
        label: node.label ?? node.definitionId,
        description: patch.summary,
        x: failed.x + DETERMINISTIC_PATH_X_OFFSET,
        y: failed.y + DETERMINISTIC_PATH_Y_OFFSET * (index + 1),
        width: failed.width,
        height: failed.height,
        zIndex: failed.zIndex,
        disabled: false,
        parameterValues: deterministicPathParameterValues(node, adaptation.adaptationId),
        // Stamped as it is inserted rather than by a later `set_node_metadata`:
        // the node exists only because of this change, so a rollback that
        // deletes it removes the stamp with it.
        metadata: withAutomationStudioNodeAdaptationId({}, adaptation.adaptationId)
      }
    });
  }
  const steps = path.nodes.map((node) => node.nodeId);
  operations.push(deterministicPathEdge(adaptation, targetFlowId, failedNodeId, "failed", steps[0]!, patch.summary));
  for (let index = 0; index + 1 < steps.length; index += 1) {
    operations.push(deterministicPathEdge(adaptation, targetFlowId, steps[index]!, "success", steps[index + 1]!, patch.summary));
  }
  if (path.returnToNodeId) operations.push(deterministicPathEdge(adaptation, targetFlowId, steps[steps.length - 1]!, "success", path.returnToNodeId, patch.summary));
  assertInsertedNodesAreWired(operations, adaptation.adaptationId);
  return operations;
}

/**
 * Refuses a request that would insert a node no edge in the same request enters.
 *
 * An unwired inserted node is not inert. `chooseAutomationStudioStartNode` takes
 * the start of a graph with no Start node to be the one node nothing enters, so
 * a second such node makes the start ambiguous and the very next run refuses to
 * begin; and a node a run does reach without being routed to it executes an
 * action nobody asked for. This reads the operations that were built rather than
 * restating how they were built, so dropping the wiring fails here instead of
 * reaching the graph.
 */
function assertInsertedNodesAreWired(operations: AutomationStudioGraphPatchOperation[], adaptationId: string): void {
  const entered = new Set<string>();
  for (const operation of operations) if (operation.op === "add_edge") entered.add(operation.edge.targetNodeId);
  const unwired: string[] = [];
  for (const operation of operations) if (operation.op === "add_node" && !entered.has(operation.node.nodeId)) unwired.push(operation.node.nodeId);
  if (unwired.length) throw new Error(`Deterministic path would insert unreachable node${unwired.length > 1 ? "s" : ""} ${unwired.join(", ")}; ${adaptationId} refused.`);
}

function deterministicPathEdge(adaptation: AutomationStudioFlowAdaptation, flowId: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, label: string): AutomationStudioGraphPatchOperation {
  return {
    op: "add_edge",
    edge: {
      edgeId: `adaptation.${safeSegment(adaptation.adaptationId)}.path.${safeSegment(sourceNodeId)}.${safeSegment(targetNodeId)}`,
      flowId,
      sourceNodeId,
      targetNodeId,
      sourcePortId,
      targetPortId: "in",
      label,
      metadata: { adaptationId: adaptation.adaptationId }
    }
  };
}

/** The parameters an inserted node runs with: its own, then its target where it reads one, then its expectation. */
function deterministicPathParameterValues(node: AutomationStudioDeterministicPathNode, adaptationId: string): JsonObject {
  const parameters: JsonObject = { ...(node.parameters ?? {}) };
  if (node.target !== undefined) Object.assign(parameters, actionTargetParameterValues({ nodeId: node.nodeId, definitionId: node.definitionId, parameterValues: parameters }, node.target, adaptationId));
  if (node.expectation) Object.assign(parameters, node.expectation);
  return parameters;
}

async function liveGraphNode(graph: AutomationStudioProjectGraphRepository, nodeId: string, flowId: string): Promise<Awaited<ReturnType<AutomationStudioProjectGraphRepository["getNode"]>>> {
  const node = await graph.getNode(nodeId);
  return node && node.flowId === flowId && node.deletedAt === null ? node : null;
}

function gateRefusal(issue: string): string { return `Adaptation cannot be applied: ${issue}`; }

// Only `{ ok: true, issues: [] }` passes. A refusal carries its issues; any
// other shape, or a pass that lists issues, is no verdict at all.
function promotionGateVerdictFrom(value: unknown): PromotionGateVerdict {
  const verdict = isPlainJsonObject(value) ? value : {};
  const issues = Array.isArray(verdict.issues) && verdict.issues.every((issue) => typeof issue === "string") ? verdict.issues as string[] : undefined;
  if (typeof verdict.ok !== "boolean" || !issues || (verdict.ok && issues.length > 0)) return { ok: false, reason: gateRefusal("its promotion gates returned no verdict.") };
  if (verdict.ok) return { ok: true };
  return { ok: false, reason: gateRefusal(issues.length ? issues.join("; ") : "its promotion gates refused it.") };
}

function isPlainJsonObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

/**
 * The operations to retry an apply with. An apply whose graph patch committed
 * before node provenance existed committed no stamp, so it is finished by
 * replaying the request it committed; the node then lists no stamp for it,
 * which is true. Any other request is returned as built.
 */
function operationsForCommittedApply(operations: AutomationStudioGraphPatchOperation[], existing: { status: string; request_digest: string } | undefined, request: { flowId: string; baseRevision: number; authorId: string; message: string }): AutomationStudioGraphPatchOperation[] {
  if (existing?.status !== "committed" || automationStudioGraphPatchRequestDigest({ ...request, operations }) === existing.request_digest) return operations;
  const unstamped = operations.filter((operation) => operation.op !== "set_node_metadata");
  return automationStudioGraphPatchRequestDigest({ ...request, operations: unstamped }) === existing.request_digest ? unstamped : operations;
}

const MATCHING_ASSIGNMENTS = "failure_signature = ?, confidence_tier = ?, origin_entry_point = ?";
const FAILURE_SIGNATURE_MAX_LENGTH = 512;
const MATCHING_BACKFILL_BATCH = 200;

/**
 * The typed columns a change is matched and queried by, derived from the saved
 * record on every write so they cannot drift from it.
 *
 * - Failure signature: `metadata.failureSignature` first, because live patches
 *   write it there and the known-adaptation gate matches on it; otherwise the
 *   origin's. A value the column cannot hold is left out rather than failing the write.
 * - Confidence tier: decided from the validation results and the risk, never
 *   copied from a stored tier.
 * - Entry point: the origin's, read only through its strict parser.
 */
function adaptationMatchingColumns(input: { metadata?: JsonObject | undefined; validationResults?: readonly unknown[] | undefined; riskLevel: AutomationStudioAdaptationRiskLevel }): AdaptationMatchingColumns {
  const origin = parseAutomationStudioFlowChangeOrigin(input.metadata?.origin);
  const originSignature = origin && origin.entryPoint !== "instruction" ? origin.failureSignature : undefined;
  const validationResults = (input.validationResults ?? []).filter((result): result is AutomationStudioFlowAdaptationValidationResult => Boolean(result) && typeof result === "object" && !Array.isArray(result));
  return {
    failureSignature: failureSignatureValue(input.metadata?.failureSignature) ?? failureSignatureValue(originSignature) ?? null,
    confidenceTier: decideAutomationStudioChangeConfidence({ validationResults, riskLevel: input.riskLevel }).tier,
    originEntryPoint: origin?.entryPoint ?? null
  };
}

function matchingParams(input: Parameters<typeof adaptationMatchingColumns>[0]): [string | null, AutomationStudioChangeConfidence, AutomationStudioFlowChangeEntryPoint | null] {
  const columns = adaptationMatchingColumns(input);
  return [columns.failureSignature, columns.confidenceTier, columns.originEntryPoint];
}

/**
 * Maps rows written before migration 0020, which have no tier because every
 * store write sets one. The partial index lists only those rows, so once they
 * are mapped this costs a single index probe per open. A row whose saved detail
 * no longer parses maps to no signature, no entry point and `unverified`.
 */
async function mapUnmappedAdaptations(database: AutomationStudioProjectDatabaseLease["database"]): Promise<void> {
  for (;;) {
    const rows = await database.all<Pick<AdaptationRow, "adaptation_id" | "risk_level" | "status_detail_json">>("select adaptation_id, risk_level, status_detail_json from adaptations where confidence_tier is null order by adaptation_id limit ?", [MATCHING_BACKFILL_BATCH]);
    if (!rows.length) return;
    await database.transaction(async (sql) => {
      for (const row of rows) {
        const detail = object(row.status_detail_json);
        const params = matchingParams({ metadata: objectValue(detail.metadata), validationResults: Array.isArray(detail.validationResults) ? detail.validationResults : [], riskLevel: detail.canonicalRiskLevel === "destructive" ? "destructive" : row.risk_level });
        await sql.run(`update adaptations set ${MATCHING_ASSIGNMENTS} where adaptation_id = ? and confidence_tier is null`, [...params, row.adaptation_id]);
      }
    });
    if (rows.length < MATCHING_BACKFILL_BATCH) return;
  }
}

function failureSignatureValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 && value.length <= FAILURE_SIGNATURE_MAX_LENGTH ? value : undefined; }
function confidenceTierValue(value: string): AutomationStudioChangeConfidence { if (value === "unverified" || value === "provisional" || value === "established") return value; throw new Error(`Unknown confidence tier: ${value}`); }

/** The nodes and routers an applied patch changed, each once, in the order the patch first changed it. */
function appliedTargets(entities: AutomationStudioGraphPatchApplied["changedEntities"]): NonNullable<AutomationStudioFlowAdaptation["appliedTo"]> {
  const targets: NonNullable<AutomationStudioFlowAdaptation["appliedTo"]> = [];
  for (const entity of entities) {
    const kind = entity.entityKind === "node" ? "action_target" : "router";
    if (!targets.some((target) => target.kind === kind && target.id === entity.entityId)) targets.push({ kind, id: entity.entityId });
  }
  return targets;
}

// `edit_recovery` stays claimed by the graph transaction even though
// `graphPatchOperationsForAdaptation` refuses it. Handing it back would route it
// to the file-based durable applier instead, which cannot apply it either — and
// that path records no audit event, so the refusal would be silent. Refusing it
// inside the transaction writes an `apply_failed` event a reviewer can read.
//
// `insert_deterministic_path` is claimed for the same reason, and on the same
// terms: it names a node and carries a readable path, or the transaction refuses
// it and the reviewer gets an `apply_failed` event rather than silence. It only
// ever applies here, because inserting nodes and edges needs the transaction.
function isGraphTransactionCompatibleAdaptation(adaptation: AutomationStudioFlowAdaptation): boolean {
  return adaptation.patch.every((patch) => {
    if (patch.kind === "insert_deterministic_path") return Boolean(patch.targetId);
    if (patch.kind === "edit_expectation" || patch.kind === "edit_action_target" || patch.kind === "edit_recovery") return Boolean(patch.targetId);
    if (patch.kind !== "edit_router" || !patch.targetId) return false;
    return typeof objectValue(patch.after).toNodeId === "string";
  });
}

function adaptationStatusDetail(adaptation: AutomationStudioFlowAdaptation, status: AutomationStudioStoredAdaptationStatus = adaptation.status): JsonObject {
  return compact({
    canonicalStatus: status,
    canonicalRiskLevel: adaptation.riskLevel,
    validationResults: adaptation.validationResults ?? [],
    appliedTo: adaptation.appliedTo ?? [],
    metadata: adaptation.metadata ?? {},
    patchCount: adaptation.patch.length,
    ...(adaptation.proposalId ? { proposalId: adaptation.proposalId } : {})
  });
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
  return { adaptationId: row.adaptation_id, projectId, flowId: row.flow_id, subflowId: row.subflow_id, sourceRunId: row.source_run_id, status: normalizeAdaptationStatus((detail.canonicalStatus as string | undefined) ?? row.status), riskLevel: row.risk_level, approvalMode: row.approval_mode, trigger: row.trigger, baseRevision: row.base_revision, proposedRevision: row.proposed_revision, appliedRevision: row.applied_revision, author: row.author, patchCount: numberValue(detail.patchCount, 1), evidenceCount: row.evidence_object_id ? 1 : 0, promptObjectId: row.prompt_object_id, responseObjectId: row.response_object_id, patchObjectId: row.patch_object_id, evidenceObjectId: row.evidence_object_id, supersededByAdaptationId: row.superseded_by_adaptation_id, statusReason: row.status_reason, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, reviewedAt: row.reviewed_at_ms, appliedAt: row.applied_at_ms, failureSignature: row.failure_signature ?? null, confidenceTier: row.confidence_tier ?? null, originEntryPoint: row.origin_entry_point ?? null };
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
function adaptationGraphMutationId(operation: "apply" | "rollback", adaptation: AutomationStudioFlowAdaptation, targetFlowId: string): string {
  const base = `adaptation.${operation}.${safeSegment(adaptation.adaptationId)}`;
  if (!adaptation.subflowId) return base;
  const targetDigest = createHash("sha256").update(targetFlowId).digest("hex").slice(0, 12);
  return `${base.slice(0, 180)}.graph-${targetDigest}`;
}
function positive(value: unknown, fallback: number): number { const next = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback; if (next < 1) throw new Error("Revision must be positive."); return next; }
function clamp(value: number | undefined, min: number, max: number, fallback: number): number { const next = Math.trunc(value ?? fallback); return Math.max(min, Math.min(max, Number.isFinite(next) ? next : fallback)); }
function compact(value: JsonObject): JsonObject { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject; }
export function automationStudioAdaptationDigest(value: unknown): string { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"; if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
