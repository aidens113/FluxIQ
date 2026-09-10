import { createHash, randomUUID } from "node:crypto";
import type { JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import type { AutomationStudioProjectContentProtection } from "./project-content-protection.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectObjectRepository } from "./project-object-repository.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION = "automation-studio.reusable-llm-context.v1" as const;
export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_PROMPT_BYTES = 12_288;
export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_TAGS = 32;
const MAX_SOURCE_IDS = 25;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ITEMS = 256;
const MAX_STRING_BYTES = 2_048;
const FORBIDDEN_KEY = /^(?:authorization|cookie|cookies|credential|credentials|fragment|header|headers|password|query|secret|selectedtext|token|tokens)$/u;
const FORBIDDEN_COMPOUND_KEY = /(?:accesstoken|authtoken|bearertoken|refreshtoken|sessiontoken|cookiejar|credential|password|passwd|requestheaders?|responseheaders?|rawhtml|rawpage|rawdata|pagesnapshot|rawsnapshot|querystring|urlquery|urlfragment|selectedtext|enteredvalue|inputvalue|formvalue|selectedvalue)/u;

export type AutomationStudioReusableLlmContextOutcome = "succeeded" | "failed" | "rejected" | "reverted" | "unknown";
export type AutomationStudioReusableLlmContextReviewerState = "unreviewed" | "approved" | "rejected" | "reverted";
export type AutomationStudioReusableLlmContextValidationState = "unknown" | "validated" | "applied";
export type AutomationStudioReusableLlmContextTag = Readonly<{ name: string; value: string }>;

export type AutomationStudioReusableLlmContextRecord = {
  contractVersion: typeof AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION;
  recordId: string;
  projectId: string;
  flowId: string;
  subflowId?: string;
  domainId: string;
  evidenceKind: string;
  evidenceSchemaVersion: string;
  sanitizerVersion: string;
  compatibilityTags: AutomationStudioReusableLlmContextTag[];
  promptProjection: JsonValue;
  outcome: AutomationStudioReusableLlmContextOutcome;
  reviewerState: AutomationStudioReusableLlmContextReviewerState;
  validationState: AutomationStudioReusableLlmContextValidationState;
  sourceRunIds: string[];
  sourceAdaptationIds: string[];
  byteCount: number;
  contentDigest: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
};

export type AutomationStudioReusableLlmContextWrite = Pick<AutomationStudioReusableLlmContextRecord,
  "flowId" | "domainId" | "evidenceKind" | "evidenceSchemaVersion" | "sanitizerVersion" | "promptProjection"
> & Partial<Pick<AutomationStudioReusableLlmContextRecord,
  "recordId" | "subflowId" | "compatibilityTags" | "outcome" | "reviewerState" | "validationState" | "sourceRunIds" | "sourceAdaptationIds" | "createdAt"
>> & { ttlMs?: number };

export type AutomationStudioReusableLlmContextList = {
  flowId?: string;
  subflowId?: string | null;
  domainId?: string;
  evidenceKind?: string;
  evidenceSchemaVersion?: string;
  sanitizerVersion?: string;
  compatibilityTags?: readonly AutomationStudioReusableLlmContextTag[];
  compatibilityMode?: "includes" | "exact";
  now?: number;
  limit?: number;
};

export type AutomationStudioReusableLlmContextAuditEvent = {
  eventId: string;
  eventType: "created" | "disposition_changed" | "deleted" | "scope_cleared" | "expired_purged" | "packed";
  recordId?: string;
  flowId?: string;
  subflowId?: string;
  domainId?: string;
  actorId?: string;
  detail: Readonly<Record<string, string | number | boolean>>;
  createdAt: number;
};

type ContextRow = {
  record_id: string; flow_id: string; subflow_id: string | null; domain_id: string; evidence_kind: string;
  contract_version: string; evidence_schema_version: string; sanitizer_version: string; compatibility_tags_json: string;
  outcome: AutomationStudioReusableLlmContextOutcome; reviewer_state: AutomationStudioReusableLlmContextReviewerState;
  validation_state: AutomationStudioReusableLlmContextValidationState;
  source_run_ids_json: string; source_adaptation_ids_json: string; prompt_object_id: string; prompt_reference_id: string;
  byte_count: number; content_digest: string; created_at_ms: number; last_used_at_ms: number; expires_at_ms: number;
};
type AuditRow = { event_id: string; event_type: AutomationStudioReusableLlmContextAuditEvent["eventType"]; record_id: string | null; flow_id: string | null; subflow_id: string | null; domain_id: string | null; actor_id: string | null; detail_json: string; created_at_ms: number };

/** Project-isolated durable storage for domain-sanitized, prompt-safe reusable LLM context. Disabled unless explicitly enabled. */
export class AutomationStudioProjectReusableLlmContextStore {
  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly content: AutomationStudioProjectContentStore,
    private readonly objects: AutomationStudioProjectObjectRepository,
    readonly enabled: boolean,
    private readonly contentProtectionConfigured: boolean
  ) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; enabled?: boolean; contentProtection?: AutomationStudioProjectContentProtection }): Promise<AutomationStudioProjectReusableLlmContextStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      const content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId, ...(input.contentProtection ? { protection: input.contentProtection } : {}) });
      const objects = await AutomationStudioProjectObjectRepository.open({ pool: input.pool, projectId: input.projectId });
      return new AutomationStudioProjectReusableLlmContextStore(lease, content, objects, input.enabled === true, Boolean(input.contentProtection));
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.objects.close();
    await this.content.close();
    await this.lease.release();
  }

  async put(input: AutomationStudioReusableLlmContextWrite, options: { actorId?: string } = {}): Promise<AutomationStudioReusableLlmContextRecord> {
    this.requireEnabled();
    if (!this.contentProtectionConfigured) throw new Error("Reusable LLM context writes require project content protection.");
    const createdAt = timestamp(input.createdAt ?? Date.now(), "createdAt");
    const ttlMs = integerInRange(input.ttlMs ?? AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_DEFAULT_TTL_MS, 1, AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS, "ttlMs");
    const recordId = input.recordId === undefined ? `llm-context:${randomUUID()}` : id(input.recordId, "record");
    if (await this.row(recordId)) throw new Error(`Reusable LLM context ${recordId} already exists.`);
    const promptProjection = canonicalJson(input.promptProjection);
    const encoded = Buffer.from(JSON.stringify(promptProjection), "utf8");
    if (encoded.byteLength > AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_PROMPT_BYTES) throw new Error("Reusable LLM context prompt projection exceeds its byte limit.");
    const contentDigest = createHash("sha256").update(encoded).digest("hex");
    const compatibilityTags = tags(input.compatibilityTags ?? []);
    const sourceRunIds = ids(input.sourceRunIds ?? [], "source run");
    const sourceAdaptationIds = ids(input.sourceAdaptationIds ?? [], "source adaptation");
    const write = await this.content.putBytes({
      content: encoded,
      mediaType: "application/json",
      extension: "json",
      owner: { ownerKind: "reusable_llm_context", ownerId: recordId, purpose: "prompt_projection" },
      createdAt,
      protect: true
    });
    try {
      await this.lease.database.run(`insert into reusable_llm_contexts
        (record_id, flow_id, subflow_id, domain_id, evidence_kind, contract_version, evidence_schema_version, sanitizer_version,
         compatibility_tags_json, outcome, reviewer_state, validation_state, source_run_ids_json, source_adaptation_ids_json, prompt_object_id,
         prompt_reference_id, byte_count, content_digest, created_at_ms, last_used_at_ms, expires_at_ms)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        recordId, id(input.flowId, "flow"), input.subflowId === undefined ? null : id(input.subflowId, "subflow"),
        id(input.domainId, "domain"), kind(input.evidenceKind, "evidence kind"), AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION,
        version(input.evidenceSchemaVersion, "evidence schema"), version(input.sanitizerVersion, "sanitizer"), JSON.stringify(compatibilityTags),
        outcome(input.outcome ?? "unknown"), reviewerState(input.reviewerState ?? "unreviewed"), validationState(input.validationState ?? "unknown"), JSON.stringify(sourceRunIds),
        JSON.stringify(sourceAdaptationIds), write.object.objectId, write.reference!.referenceId, encoded.byteLength, contentDigest,
        createdAt, createdAt, createdAt + ttlMs
      ]);
    } catch (error) {
      if (write.reference) await this.objects.deleteReference(write.reference.referenceId).catch(() => undefined);
      throw error;
    }
    const saved = (await this.get(recordId, { now: createdAt }))!;
    await this.appendAudit({ eventType: "created", recordId, flowId: saved.flowId, ...(saved.subflowId ? { subflowId: saved.subflowId } : {}), domainId: saved.domainId, ...(options.actorId ? { actorId: options.actorId } : {}), detail: { byteCount: saved.byteCount, outcome: saved.outcome, reviewerState: saved.reviewerState, validationState: saved.validationState }, createdAt });
    return saved;
  }

  async get(recordId: string, input: { now?: number; touch?: boolean } = {}): Promise<AutomationStudioReusableLlmContextRecord | null> {
    if (!this.enabled) return null;
    const now = timestamp(input.now ?? Date.now(), "now");
    const row = await this.row(recordId);
    if (!row || row.expires_at_ms <= now) return null;
    if (input.touch === true && now > row.last_used_at_ms) {
      await this.lease.database.run("update reusable_llm_contexts set last_used_at_ms = ? where record_id = ?", [now, row.record_id]);
      row.last_used_at_ms = now;
    }
    return this.record(row);
  }

  async list(input: AutomationStudioReusableLlmContextList = {}): Promise<AutomationStudioReusableLlmContextRecord[]> {
    if (!this.enabled) return [];
    const now = timestamp(input.now ?? Date.now(), "now");
    const clauses = ["expires_at_ms > ?"];
    const params: unknown[] = [now];
    if (input.flowId !== undefined) { clauses.push("flow_id = ?"); params.push(id(input.flowId, "flow")); }
    if (input.subflowId !== undefined) { clauses.push(input.subflowId === null ? "subflow_id is null" : "subflow_id = ?"); if (input.subflowId !== null) params.push(id(input.subflowId, "subflow")); }
    if (input.domainId !== undefined) { clauses.push("domain_id = ?"); params.push(id(input.domainId, "domain")); }
    if (input.evidenceKind !== undefined) { clauses.push("evidence_kind = ?"); params.push(kind(input.evidenceKind, "evidence kind")); }
    if (input.evidenceSchemaVersion !== undefined) { clauses.push("evidence_schema_version = ?"); params.push(version(input.evidenceSchemaVersion, "evidence schema")); }
    if (input.sanitizerVersion !== undefined) { clauses.push("sanitizer_version = ?"); params.push(version(input.sanitizerVersion, "sanitizer")); }
    const requiredTags = tags(input.compatibilityTags ?? []);
    for (const tag of requiredTags) {
      clauses.push("exists (select 1 from json_each(reusable_llm_contexts.compatibility_tags_json) as required_tag where json_extract(required_tag.value, '$.name') = ? and json_extract(required_tag.value, '$.value') = ?)");
      params.push(tag.name, tag.value);
    }
    if (input.compatibilityMode === "exact") { clauses.push("json_array_length(compatibility_tags_json) = ?"); params.push(requiredTags.length); }
    const rows = await this.lease.database.all<ContextRow>(`select * from reusable_llm_contexts where ${clauses.join(" and ")} order by created_at_ms desc, record_id limit ?`, [...params, integerInRange(input.limit ?? 25, 1, 100, "limit")]);
    return Promise.all(rows.map((row) => this.record(row)));
  }

  async updateDisposition(recordId: string, input: { outcome: AutomationStudioReusableLlmContextOutcome; reviewerState: AutomationStudioReusableLlmContextReviewerState; validationState?: AutomationStudioReusableLlmContextValidationState; actorId?: string; changedAt?: number }): Promise<boolean> {
    this.requireEnabled();
    const row = await this.row(recordId);
    if (!row) return false;
    const nextValidation = validationState(input.validationState ?? row.validation_state);
    const changed = (await this.lease.database.run("update reusable_llm_contexts set outcome = ?, reviewer_state = ?, validation_state = ? where record_id = ?", [outcome(input.outcome), reviewerState(input.reviewerState), nextValidation, row.record_id])).changes > 0;
    if (changed) await this.appendAudit({ eventType: "disposition_changed", recordId: row.record_id, flowId: row.flow_id, ...(row.subflow_id ? { subflowId: row.subflow_id } : {}), domainId: row.domain_id, ...(input.actorId ? { actorId: input.actorId } : {}), detail: { outcome: input.outcome, reviewerState: input.reviewerState, validationState: nextValidation }, ...(input.changedAt === undefined ? {} : { createdAt: input.changedAt }) });
    return changed;
  }

  async delete(recordId: string, options: { actorId?: string; changedAt?: number; audit?: boolean } = {}): Promise<boolean> {
    this.requireEnabled();
    const row = await this.row(recordId);
    if (!row) return false;
    await this.lease.database.run("delete from reusable_llm_contexts where record_id = ?", [row.record_id]);
    await this.objects.deleteReference(row.prompt_reference_id);
    if (options.audit !== false) await this.appendAudit({ eventType: "deleted", recordId: row.record_id, flowId: row.flow_id, ...(row.subflow_id ? { subflowId: row.subflow_id } : {}), domainId: row.domain_id, ...(options.actorId ? { actorId: options.actorId } : {}), detail: { reason: "explicit" }, ...(options.changedAt === undefined ? {} : { createdAt: options.changedAt }) });
    return true;
  }

  async purgeExpired(input: { now?: number; limit?: number; domainId?: string; actorId?: string } = {}): Promise<{ deleted: string[] }> {
    if (!this.enabled) return { deleted: [] };
    const domainClause = input.domainId ? " and domain_id = ?" : "";
    const rows = await this.lease.database.all<{ record_id: string }>(`select record_id from reusable_llm_contexts where expires_at_ms <= ?${domainClause} order by expires_at_ms, record_id limit ?`, [timestamp(input.now ?? Date.now(), "now"), ...(input.domainId ? [id(input.domainId, "domain")] : []), integerInRange(input.limit ?? 100, 1, 500, "limit")]);
    const deleted: string[] = [];
    for (const row of rows) if (await this.delete(row.record_id, { ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.now === undefined ? {} : { changedAt: input.now }), audit: false })) deleted.push(row.record_id);
    if (deleted.length) await this.appendAudit({ eventType: "expired_purged", ...(input.actorId ? { actorId: input.actorId } : {}), detail: { deletedCount: deleted.length }, ...(input.now === undefined ? {} : { createdAt: input.now }) });
    return { deleted };
  }

  async clearScope(input: { flowId: string; subflowId?: string | null; domainId?: string; actorId?: string; changedAt?: number }): Promise<{ deleted: string[] }> {
    this.requireEnabled();
    const deleted: string[] = [];
    while (true) {
      const records = await this.list({ ...input, now: 0, limit: 100 });
      if (!records.length) break;
      for (const record of records) if (await this.delete(record.recordId, { ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }), audit: false })) deleted.push(record.recordId);
    }
    if (deleted.length) await this.appendAudit({ eventType: "scope_cleared", flowId: input.flowId, ...(input.subflowId ? { subflowId: input.subflowId } : {}), ...(input.domainId ? { domainId: input.domainId } : {}), ...(input.actorId ? { actorId: input.actorId } : {}), detail: { deletedCount: deleted.length }, ...(input.changedAt === undefined ? {} : { createdAt: input.changedAt }) });
    return { deleted };
  }

  async appendAudit(input: Omit<AutomationStudioReusableLlmContextAuditEvent, "eventId" | "createdAt"> & { createdAt?: number }): Promise<AutomationStudioReusableLlmContextAuditEvent> {
    this.requireEnabled();
    const event: AutomationStudioReusableLlmContextAuditEvent = {
      eventId: `llm-context-audit:${randomUUID()}`, eventType: input.eventType,
      ...(input.recordId ? { recordId: id(input.recordId, "record") } : {}), ...(input.flowId ? { flowId: id(input.flowId, "flow") } : {}),
      ...(input.subflowId ? { subflowId: id(input.subflowId, "subflow") } : {}), ...(input.domainId ? { domainId: id(input.domainId, "domain") } : {}),
      ...(input.actorId ? { actorId: id(input.actorId, "actor") } : {}), detail: safeAuditDetail(input.detail), createdAt: timestamp(input.createdAt ?? Date.now(), "createdAt")
    };
    await this.lease.database.run("insert into reusable_llm_context_audit_events (event_id, event_type, record_id, flow_id, subflow_id, domain_id, actor_id, detail_json, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [event.eventId, event.eventType, event.recordId ?? null, event.flowId ?? null, event.subflowId ?? null, event.domainId ?? null, event.actorId ?? null, JSON.stringify(event.detail), event.createdAt]);
    return event;
  }

  async listAudit(input: { flowId?: string; recordId?: string; limit?: number } = {}): Promise<AutomationStudioReusableLlmContextAuditEvent[]> {
    if (!this.enabled) return [];
    const clauses: string[] = []; const params: unknown[] = [];
    if (input.flowId) { clauses.push("flow_id = ?"); params.push(id(input.flowId, "flow")); }
    if (input.recordId) { clauses.push("record_id = ?"); params.push(id(input.recordId, "record")); }
    const rows = await this.lease.database.all<AuditRow>(`select * from reusable_llm_context_audit_events${clauses.length ? ` where ${clauses.join(" and ")}` : ""} order by created_at_ms desc, event_id limit ?`, [...params, integerInRange(input.limit ?? 100, 1, 500, "limit")]);
    return rows.map((row) => ({ eventId: row.event_id, eventType: row.event_type, ...(row.record_id ? { recordId: row.record_id } : {}), ...(row.flow_id ? { flowId: row.flow_id } : {}), ...(row.subflow_id ? { subflowId: row.subflow_id } : {}), ...(row.domain_id ? { domainId: row.domain_id } : {}), ...(row.actor_id ? { actorId: row.actor_id } : {}), detail: safeAuditDetail(JSON.parse(row.detail_json) as Record<string, string | number | boolean>), createdAt: row.created_at_ms }));
  }

  private requireEnabled(): void {
    if (!this.enabled) throw new Error("Reusable LLM context is disabled.");
  }

  private row(recordId: string): Promise<ContextRow | undefined> {
    return this.lease.database.get<ContextRow>("select * from reusable_llm_contexts where record_id = ?", [id(recordId, "record")]);
  }

  private async record(row: ContextRow): Promise<AutomationStudioReusableLlmContextRecord> {
    if (row.contract_version !== AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION) throw new Error("Unsupported reusable LLM context contract version.");
    const asset = await this.content.readBytesByObjectId(row.prompt_object_id);
    const digest = createHash("sha256").update(asset.content).digest("hex");
    if (asset.content.byteLength !== row.byte_count || digest !== row.content_digest) throw new Error("Reusable LLM context content metadata mismatch.");
    const promptProjection = canonicalJson(JSON.parse(asset.content.toString("utf8")) as JsonValue);
    return {
      contractVersion: AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION,
      recordId: row.record_id, projectId: this.lease.projectId, flowId: row.flow_id,
      ...(row.subflow_id ? { subflowId: row.subflow_id } : {}), domainId: row.domain_id, evidenceKind: row.evidence_kind,
      evidenceSchemaVersion: row.evidence_schema_version, sanitizerVersion: row.sanitizer_version,
      compatibilityTags: parseTags(row.compatibility_tags_json), promptProjection, outcome: outcome(row.outcome),
      reviewerState: reviewerState(row.reviewer_state), validationState: validationState(row.validation_state), sourceRunIds: parseIds(row.source_run_ids_json, "source run"),
      sourceAdaptationIds: parseIds(row.source_adaptation_ids_json, "source adaptation"), byteCount: row.byte_count,
      contentDigest: row.content_digest, createdAt: row.created_at_ms, lastUsedAt: row.last_used_at_ms, expiresAt: row.expires_at_ms
    };
  }
}

function id(value: string, label: string): string { const result = value.trim(); if (!result || result.length > 200 || !/^[A-Za-z0-9._:-]+$/u.test(result)) throw new Error(`Invalid ${label} ID.`); return result; }
function kind(value: string, label: string): string { const result = value.trim(); if (!result || result.length > 100 || !/^[A-Za-z0-9._:-]+$/u.test(result)) throw new Error(`Invalid ${label}.`); return result; }
function version(value: string, label: string): string { const result = value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:+@/-]{0,99}$/u.test(result)) throw new Error(`Invalid ${label} version.`); return result; }
function timestamp(value: number, label: string): number { return integerInRange(value, 0, Number.MAX_SAFE_INTEGER, label); }
function integerInRange(value: number, min: number, max: number, label: string): number { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`); return value; }
function outcome(value: string): AutomationStudioReusableLlmContextOutcome { if (!["succeeded", "failed", "rejected", "reverted", "unknown"].includes(value)) throw new Error("Invalid reusable LLM context outcome."); return value as AutomationStudioReusableLlmContextOutcome; }
function reviewerState(value: string): AutomationStudioReusableLlmContextReviewerState { if (!["unreviewed", "approved", "rejected", "reverted"].includes(value)) throw new Error("Invalid reusable LLM context reviewer state."); return value as AutomationStudioReusableLlmContextReviewerState; }
function validationState(value: string): AutomationStudioReusableLlmContextValidationState { if (!["unknown", "validated", "applied"].includes(value)) throw new Error("Invalid reusable LLM context validation state."); return value as AutomationStudioReusableLlmContextValidationState; }
function ids(values: readonly string[], label: string): string[] { if (values.length > MAX_SOURCE_IDS) throw new Error(`Reusable LLM context ${label} IDs exceed their item limit.`); return [...new Set(values.map((value) => id(value, label)))].sort(); }
function parseIds(value: string, label: string): string[] { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`Invalid persisted ${label} IDs.`); return ids(parsed, label); }
function tags(values: readonly AutomationStudioReusableLlmContextTag[]): AutomationStudioReusableLlmContextTag[] { if (values.length > MAX_TAGS) throw new Error("Reusable LLM context compatibility tags exceed their item limit."); const normalized = values.map((tag) => ({ name: tagText(tag.name, 100, "compatibility tag name"), value: tagText(tag.value, 500, "compatibility tag value") })); return [...new Map(normalized.map((tag) => [`${tag.name}\0${tag.value}`, tag])).values()].sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value)); }
function parseTags(value: string): AutomationStudioReusableLlmContextTag[] { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed)) throw new Error("Invalid persisted reusable LLM context tags."); return tags(parsed as AutomationStudioReusableLlmContextTag[]); }
function tagText(value: string, maxBytes: number, label: string): string { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > maxBytes || /[\u0000-\u001f\u007f]/u.test(result)) throw new Error(`Invalid ${label}.`); return result; }

function canonicalJson(value: JsonValue): JsonValue {
  let items = 0;
  const visit = (candidate: JsonValue, depth: number, keyName?: string): JsonValue => {
    if (depth > MAX_JSON_DEPTH) throw new Error("Reusable LLM context prompt projection exceeds its depth limit.");
    if (keyName && forbiddenProjectionKey(keyName)) throw new Error(`Reusable LLM context prompt projection contains forbidden field ${keyName}.`);
    items += 1;
    if (items > MAX_JSON_ITEMS) throw new Error("Reusable LLM context prompt projection exceeds its item limit.");
    if (typeof candidate === "string") {
      if (Buffer.byteLength(candidate, "utf8") > MAX_STRING_BYTES) throw new Error("Reusable LLM context prompt projection contains an oversized string.");
      return candidate;
    }
    if (typeof candidate === "number" && !Number.isFinite(candidate)) throw new Error("Reusable LLM context prompt projection contains a non-finite number.");
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "number") return candidate;
    if (Array.isArray(candidate)) return candidate.map((item) => visit(item, depth + 1));
    return Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, visit(candidate[key]!, depth + 1, key)]));
  };
  return visit(value, 0);
}

function forbiddenProjectionKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  return FORBIDDEN_KEY.test(normalized) || FORBIDDEN_COMPOUND_KEY.test(normalized);
}

function safeAuditDetail(input: Readonly<Record<string, string | number | boolean>>): Readonly<Record<string, string | number | boolean>> {
  const entries = Object.entries(input);
  if (entries.length > 16) throw new Error("Reusable LLM context audit detail exceeds its item limit.");
  return Object.fromEntries(entries.map(([key, value]) => {
    const safeKey = kind(key, "audit detail key");
    if (forbiddenProjectionKey(safeKey)) throw new Error("Reusable LLM context audit detail contains a forbidden field.");
    if (typeof value === "string" && Buffer.byteLength(value, "utf8") > 200) throw new Error("Reusable LLM context audit detail contains an oversized string.");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Reusable LLM context audit detail contains a non-finite number.");
    return [safeKey, value];
  }));
}
