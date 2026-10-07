import { createHash } from "node:crypto";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { automationStudioCandidateRequirementsDigest } from "../../../runtime/flow-bootstrap/verification/index.ts";
import type { AutomationStudioCandidateLedgerRecord, AutomationStudioCandidateLedgerRequest, AutomationStudioCandidateLedgerStage } from "./contracts.ts";
import { AUTOMATION_STUDIO_CANDIDATE_VERIFICATION_MIGRATION } from "./migration.ts";

type Row = { request_digest: string; record_digest: string; record_json: string };
/** Internal trusted adapter ledger. It never writes or authorizes accepted graphs. */
export class AutomationStudioCandidateVerificationStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioCandidateVerificationStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CANDIDATE_VERIFICATION_MIGRATION] }).migrate();
      return new AutomationStudioCandidateVerificationStore(lease);
    } catch (error) { await lease.release(); throw error; }
  }
  close(): Promise<void> { return this.lease.release(); }
  async claim(request: AutomationStudioCandidateLedgerRequest): Promise<{ claimed: boolean; record: AutomationStudioCandidateLedgerRecord }> {
    validateRequest(request, this.lease.projectId);
    return this.lease.database.transaction(async sql => {
      const existing = await this.read(sql, request.attemptId);
      if (existing) {
        if (digest(existing.request) !== digest(request)) throw new Error("candidate.ledger_claim_conflict");
        return { claimed: false, record: existing };
      }
      const record: AutomationStudioCandidateLedgerRecord = { request: structuredClone(request), status: "pending", stages: {} };
      await this.write(sql, record);
      return { claimed: true, record: structuredClone(record) };
    });
  }
  async get(attemptId: string): Promise<AutomationStudioCandidateLedgerRecord | null> { return this.read(this.lease.database, attemptId); }
  async beginStage(attemptId: string, stage: AutomationStudioCandidateLedgerStage): Promise<void> {
    await this.mutate(attemptId, record => {
      if (record.status !== "pending" || record.stages[stage]) throw new Error("candidate.ledger_stage_already_claimed");
      const previous = stage === "execution" ? "start" : stage === "evidence" ? "execution" : stage === "verification" ? "evidence" : undefined;
      if (previous && record.stages[previous]?.status !== "committed") throw new Error("candidate.ledger_stage_order_invalid");
      record.stages[stage] = { status: "pending" };
    });
  }
  async commitStage(attemptId: string, stage: AutomationStudioCandidateLedgerStage, payload: unknown): Promise<void> {
    await this.mutate(attemptId, record => {
      if (record.status !== "pending" || record.stages[stage]?.status !== "pending") throw new Error("candidate.ledger_stage_not_pending");
      record.stages[stage] = { status: "committed", payload: structuredClone(payload) };
      validateStages(record);
    });
  }
  async finish(attemptId: string, outcome: NonNullable<AutomationStudioCandidateLedgerRecord["outcome"]>): Promise<void> {
    await this.mutate(attemptId, record => {
      if (outcome.status !== "draft" || !outcome.code || record.status !== "pending" || Object.values(record.stages).some(stage => stage?.status !== "committed")) throw new Error("candidate.ledger_outcome_unconfirmed");
      if (outcome.receipt && digest(outcome.receipt) !== digest(record.stages.verification?.payload)) throw new Error("candidate.ledger_outcome_receipt_mismatch");
      record.status = "committed"; record.outcome = structuredClone(outcome);
    });
  }
  async markUnknown(attemptId: string): Promise<void> {
    await this.mutate(attemptId, record => {
      if (record.status === "committed") return;
      record.status = "outcome_unknown";
      for (const stage of Object.values(record.stages)) if (stage?.status === "pending") stage.status = "outcome_unknown";
    });
  }
  private async mutate(attemptId: string, mutate: (record: AutomationStudioCandidateLedgerRecord) => void): Promise<void> {
    await this.lease.database.transaction(async sql => {
      const record = await this.read(sql, attemptId);
      if (!record) throw new Error("candidate.ledger_attempt_missing");
      mutate(record); await this.write(sql, record);
    });
  }
  private async read(sql: AutomationStudioSqlExecutor, attemptId: string): Promise<AutomationStudioCandidateLedgerRecord | null> {
    id(attemptId);
    const row = await sql.get<Row>("select request_digest, record_digest, record_json from candidate_verification_attempts where attempt_id = ?", [attemptId]);
    if (!row) return null;
    const record = JSON.parse(row.record_json) as AutomationStudioCandidateLedgerRecord;
    validateRequest(record.request, this.lease.projectId);
    if (record.request.attemptId !== attemptId || row.request_digest !== digest(record.request) || row.record_digest !== digest(record) || !["pending", "committed", "outcome_unknown"].includes(record.status)) throw new Error("candidate.ledger_corrupt");
    validateStages(record);
    if (record.status === "committed" && (!record.outcome || record.outcome.status !== "draft" || Object.values(record.stages).some(stage => stage?.status !== "committed"))) throw new Error("candidate.ledger_corrupt");
    return structuredClone(record);
  }
  private async write(sql: AutomationStudioSqlExecutor, record: AutomationStudioCandidateLedgerRecord): Promise<void> {
    const json = JSON.stringify(record);
    if (json.length > 512_000) throw new Error("candidate.ledger_payload_too_large");
    await sql.run("insert into candidate_verification_attempts (attempt_id, request_digest, record_digest, record_json, updated_at_ms) values (?, ?, ?, ?, ?) on conflict(attempt_id) do update set record_digest = excluded.record_digest, record_json = excluded.record_json, updated_at_ms = excluded.updated_at_ms", [record.request.attemptId, digest(record.request), digest(record), json, Date.now()]);
  }
}
function id(value: string): void { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) throw new Error("candidate.ledger_id_invalid"); }
function hash(value: string): void { if (typeof value !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/.test(value)) throw new Error("candidate.ledger_digest_invalid"); }
function digest(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function validateRequest(request: AutomationStudioCandidateLedgerRequest, projectId: string): void {
  id(request.attemptId); const binding = request.binding, identity = binding.identity;
  id(binding.candidateId); id(identity.projectId); id(identity.flowId);
  if (identity.projectId !== projectId || !Number.isSafeInteger(identity.revision) || identity.revision < 1 || !Number.isSafeInteger(binding.baseSettingsRevision) || binding.baseSettingsRevision < 1) throw new Error("candidate.ledger_binding_invalid");
  for (const value of [identity.digest, identity.baseDependencyDigest, identity.requirementsDigest, binding.permissionDigest, binding.registryDigest, request.conditionsDigest]) hash(value);
  for (const value of [binding.compilerVersion, binding.normalizerVersion, binding.issuerVersion]) id(value);
  if (!binding.originalInstructionText || binding.originalInstructionText.length > 64_000 || request.brief.instructions.length > 1_000 || !request.brief.instructions.length || automationStudioCandidateRequirementsDigest(request.brief) !== identity.requirementsDigest || binding.instructionSources.length !== request.brief.instructions.length) throw new Error("candidate.ledger_requirements_binding_invalid");
  if (new Set(binding.instructionSources.map(source => source.instructionId)).size !== binding.instructionSources.length) throw new Error("candidate.ledger_source_duplicate");
  for (const source of binding.instructionSources) {
    id(source.instructionId); hash(source.textDigest);
    const instruction = request.brief.instructions.find(entry => entry.instructionId === source.instructionId);
    if (!instruction || !Number.isSafeInteger(source.revision) || source.revision < 1 || createHash("sha256").update(instruction.text).digest("hex") !== source.textDigest.replace(/^sha256:/, "")) throw new Error("candidate.ledger_source_mismatch");
  }
}
function validateStages(record: AutomationStudioCandidateLedgerRecord): void {
  const identity = record.request.binding.identity;
  const same = (value: unknown) => digest(value) === digest(identity);
  const packet = (stage: AutomationStudioCandidateLedgerStage) => record.stages[stage]?.payload as Record<string, unknown> | undefined;
  for (const [name, stage] of Object.entries(record.stages)) {
    if (!["start", "execution", "evidence", "verification"].includes(name) || !stage || !["pending", "committed", "outcome_unknown"].includes(stage.status)) throw new Error("candidate.ledger_stage_invalid");
    if (stage.status !== "committed") continue;
    const value = packet(name as AutomationStudioCandidateLedgerStage);
    if (!value || typeof value !== "object") throw new Error("candidate.ledger_packet_invalid");
    if (name === "start") {
      id(value.receiptId as string);
      if (value.conditionsDigest !== record.request.conditionsDigest || !Array.isArray(value.subjectStates) || !Number.isSafeInteger(value.pageGeneration) || Number(value.pageGeneration) < 0 || !Number.isFinite(value.preparedAt)) throw new Error("candidate.ledger_start_invalid");
    } else {
      if (!same(value.identity)) throw new Error("candidate.ledger_identity_mismatch");
      id(value.runId as string);
      const start = packet("start");
      if (record.stages.start?.status !== "committed" || (name !== "verification" && value.startReceiptId !== start?.receiptId)) throw new Error("candidate.ledger_start_reference_mismatch");
      if (name !== "execution" && (record.stages.execution?.status !== "committed" || value.runId !== packet("execution")?.runId)) throw new Error("candidate.ledger_run_reference_mismatch");
      if (name === "execution" && (!Array.isArray(value.commands) || !["succeeded", "failed", "cancelled", "not_run"].includes(String(value.status)))) throw new Error("candidate.ledger_execution_invalid");
      if (name === "evidence" && (!Array.isArray(value.observations) || !Array.isArray(value.enumerations))) throw new Error("candidate.ledger_evidence_invalid");
      if (name === "verification" && (record.stages.evidence?.status !== "committed" || value.schemaVersion !== "candidate.verification.v1" || digest(value.startReceipt) !== digest(start) || digest(value.execution) !== digest(packet("execution")) || digest(value.evidence) !== digest(packet("evidence")) || !["satisfied", "unsatisfied", "unknown"].includes(String(value.verdict)))) throw new Error("candidate.ledger_receipt_reference_mismatch");
    }
  }
}
