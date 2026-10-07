import { randomUUID } from "node:crypto";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioProjectUnitOfWork } from "../unit-of-work.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import type { AutomationStudioAcceptedProjectSnapshot, AutomationStudioAcceptedStateBinding, AutomationStudioAcceptedStateCurrent, AutomationStudioAcceptedStateMutationResult, AutomationStudioAcceptedStateReconciliation, AutomationStudioAcceptedStateRequest, AutomationStudioAcceptedStateTombstone } from "./contracts.ts";
import { automationStudioAcceptedStateDigest } from "./digest.ts";
import { AutomationStudioAcceptedStateValidation as Validation } from "./validation.ts";
import { AUTOMATION_STUDIO_STAGED_PROJECT_AUTHORITY_MIGRATION } from "./migration.ts";

type Prepared = { request: AutomationStudioAcceptedStateRequest; requestDigest: string; payloadJson: string | null };
type Row = { project_id: string; epoch: string; generation: number; digest: string; state: "staged" | "tombstoned"; payload_kind: "state" | "tombstone" | null; payload_json: string | null; snapshot_digest: string | null };
/** Internal staged foundation. No reader, adoption, ordinary writer or promoter uses this store. */
export class AutomationStudioProjectAcceptedStateStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease, private readonly unitOfWork: AutomationStudioProjectUnitOfWork) {}
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectAcceptedStateStore> {
    Validation.id(input.projectId);
    const lease = await input.pool.acquire(input.projectId);
    let unitOfWork: AutomationStudioProjectUnitOfWork | undefined;
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_STAGED_PROJECT_AUTHORITY_MIGRATION] }).migrate();
      unitOfWork = await AutomationStudioProjectUnitOfWork.open(input);
      return new AutomationStudioProjectAcceptedStateStore(lease, unitOfWork);
    } catch (error) { await unitOfWork?.close(); await lease.release(); throw error; }
  }
  async close(): Promise<void> { try { await this.unitOfWork.close(); } finally { await this.lease.release(); } }
  readCurrent(): Promise<AutomationStudioAcceptedStateCurrent | null> { return this.read(this.lease.database); }
  /** For explicit reconciliation after an uncertain acknowledgement; no supplied digest can bypass validation. */
  requestDigest(request: AutomationStudioAcceptedStateRequest): string { return this.prepare(request).requestDigest; }
  stageInitial(input: { mutationId: string; snapshot: AutomationStudioAcceptedProjectSnapshot }): Promise<AutomationStudioAcceptedStateMutationResult> {
    return this.mutate(input.mutationId, { kind: "initial", snapshot: input.snapshot });
  }
  replaceStaged(input: { mutationId: string; expectedBinding: AutomationStudioAcceptedStateBinding; snapshot: AutomationStudioAcceptedProjectSnapshot }): Promise<AutomationStudioAcceptedStateMutationResult> {
    return this.mutate(input.mutationId, { kind: "replace", expectedBinding: input.expectedBinding, snapshot: input.snapshot });
  }
  tombstoneStaged(input: { mutationId: string; expectedBinding: AutomationStudioAcceptedStateBinding; reasonCode: string }): Promise<AutomationStudioAcceptedStateMutationResult> {
    return this.mutate(input.mutationId, { kind: "tombstone", expectedBinding: input.expectedBinding, reasonCode: input.reasonCode });
  }
  async reconcile(input: { mutationId: string; requestDigest: string }): Promise<AutomationStudioAcceptedStateReconciliation> {
    Validation.id(input.mutationId);
    if (!/^sha256:[a-f0-9]{64}$/.test(input.requestDigest)) throw new Error("staged_authority.request_digest_invalid");
    try {
      const record = await this.unitOfWork.getMutation(input.mutationId);
      if (!record) return { status: "outcome_unknown" };
      if (record.ownerKind !== "staged_project" || record.ownerId !== this.lease.projectId || record.requestDigest !== input.requestDigest || !["staged_project.initial", "staged_project.replace", "staged_project.tombstone"].includes(record.operationKind)) throw new Error("staged_authority.mutation_conflict");
      if (record.status === "failed") return { status: "failed" };
      if (record.status !== "committed" || record.responseJson === null) return { status: "outcome_unknown" };
      const result = JSON.parse(record.responseJson) as AutomationStudioAcceptedStateMutationResult;
      await this.validateResult(result, input.requestDigest, record.operationKind);
      return { status: "committed", result: { ...result, replayed: true } };
    } catch (error) {
      if (error instanceof Error && error.message === "staged_authority.mutation_conflict") throw error;
      // Missing/corrupt/unreadable joins cannot be reconciled as success or inferred rollback.
      return { status: "outcome_unknown" };
    }
  }
  private prepare(input: AutomationStudioAcceptedStateRequest): Prepared {
    const request = JSON.parse(automationStudioAcceptedStateDigest(input).json) as AutomationStudioAcceptedStateRequest;
    const keys = request.kind === "initial" ? ["kind", "snapshot"] : request.kind === "replace" ? ["kind", "expectedBinding", "snapshot"] : ["kind", "expectedBinding", "reasonCode"];
    if (Object.keys(request).length !== keys.length || Object.keys(request).some(key => !keys.includes(key))) throw new Error("staged_authority.request_envelope_invalid");
    let payloadJson: string | null = null;
    if (request.kind === "initial" || request.kind === "replace") {
      request.snapshot = Validation.snapshot(request.snapshot, this.lease.projectId);
      payloadJson = automationStudioAcceptedStateDigest(request.snapshot).json;
    } else if (request.kind !== "tombstone") throw new Error("staged_authority.operation_invalid");
    if (request.kind !== "initial") {
      Validation.binding(request.expectedBinding, this.lease.projectId);
      if (request.expectedBinding.state !== "staged") throw new Error("staged_authority.tombstoned");
    }
    if (request.kind === "tombstone") Validation.id(request.reasonCode);
    return { request, payloadJson, requestDigest: automationStudioAcceptedStateDigest({ projectId: this.lease.projectId, request }).digest };
  }
  private async mutate(mutationId: string, input: AutomationStudioAcceptedStateRequest): Promise<AutomationStudioAcceptedStateMutationResult> {
    Validation.id(mutationId); const prepared = this.prepare(input);
    const result = await this.unitOfWork.runIdempotent<AutomationStudioAcceptedStateMutationResult>({ mutationId, operationKind: `staged_project.${prepared.request.kind}`, ownerKind: "staged_project", ownerId: this.lease.projectId, requestDigest: prepared.requestDigest }, async context => {
      // Committed same-key replay is handled by UoW before this CAS against the current head.
      const current = await this.read(context.sql);
      const request = prepared.request;
      if (request.kind === "initial" ? current !== null : !current || automationStudioAcceptedStateDigest(current.binding).digest !== automationStudioAcceptedStateDigest(request.expectedBinding).digest) throw new Error("staged_authority.cas_conflict");
      const generation = current ? current.binding.generation + 1 : 1;
      if (!Number.isSafeInteger(generation)) throw new Error("staged_authority.generation_exhausted");
      const epoch = current?.binding.epoch ?? randomUUID();
      const tombstone: AutomationStudioAcceptedStateTombstone | null = request.kind === "tombstone" ? { schemaVersion: "staged_project_tombstone.v1", previousBinding: request.expectedBinding, reasonCode: request.reasonCode } : null;
      const payload = tombstone ? automationStudioAcceptedStateDigest(tombstone) : automationStudioAcceptedStateDigest(JSON.parse(prepared.payloadJson!));
      const binding: AutomationStudioAcceptedStateBinding = { projectId: this.lease.projectId, epoch, generation, digest: payload.digest, state: tombstone ? "tombstoned" : "staged" };
      await context.sql.run("insert into accepted_project_snapshots (project_id, epoch, generation, payload_kind, payload_json, digest, created_at_ms) values (?, ?, ?, ?, ?, ?, ?)", [binding.projectId, epoch, generation, tombstone ? "tombstone" : "state", payload.json, binding.digest, context.changedAt]);
      await context.sql.run("insert into accepted_project_heads (project_id, epoch, generation, digest, state) values (?, ?, ?, ?, ?) on conflict(project_id) do update set epoch=excluded.epoch, generation=excluded.generation, digest=excluded.digest, state=excluded.state", [binding.projectId, epoch, generation, binding.digest, binding.state]);
      return { recordedBinding: binding, requestDigest: prepared.requestDigest, replayed: false, productionAuthority: "unsupported" };
    });
    const record = await this.unitOfWork.getMutation(mutationId);
    if (!record || record.ownerKind !== "staged_project" || record.ownerId !== this.lease.projectId || record.operationKind !== `staged_project.${prepared.request.kind}` || record.requestDigest !== prepared.requestDigest || record.status !== "committed" || !record.responseJson || automationStudioAcceptedStateDigest(JSON.parse(record.responseJson)).digest !== automationStudioAcceptedStateDigest(result.response).digest) throw new Error("staged_authority.mutation_scope_invalid");
    this.validateRequestResult(prepared, result.response);
    await this.validateResult(result.response, prepared.requestDigest, record.operationKind);
    return { ...result.response, replayed: result.replayed };
  }
  private validateRequestResult(prepared: Prepared, result: AutomationStudioAcceptedStateMutationResult): void {
    const request = prepared.request, binding = result.recordedBinding;
    const expectedPayload = request.kind === "tombstone" ? { schemaVersion: "staged_project_tombstone.v1", previousBinding: request.expectedBinding, reasonCode: request.reasonCode } : request.snapshot;
    if (binding.digest !== automationStudioAcceptedStateDigest(expectedPayload).digest || binding.generation !== (request.kind === "initial" ? 1 : request.expectedBinding.generation + 1) || binding.state !== (request.kind === "tombstone" ? "tombstoned" : "staged") || request.kind !== "initial" && binding.epoch !== request.expectedBinding.epoch) throw new Error("staged_authority.mutation_result_mismatch");
  }
  private async validateResult(result: AutomationStudioAcceptedStateMutationResult, requestDigest: string, operationKind: string): Promise<void> {
    Validation.binding(result.recordedBinding, this.lease.projectId);
    if (result.productionAuthority !== "unsupported" || result.requestDigest !== requestDigest || typeof result.replayed !== "boolean") throw new Error("staged_authority.corrupt_result");
    const binding = result.recordedBinding;
    if (operationKind === "staged_project.initial" ? binding.state !== "staged" || binding.generation !== 1 : operationKind === "staged_project.replace" ? binding.state !== "staged" || binding.generation < 2 : operationKind !== "staged_project.tombstone" || binding.state !== "tombstoned" || binding.generation < 2) throw new Error("staged_authority.mutation_conflict");
    const recorded = await this.readHistorical(binding.projectId, binding.epoch, binding.generation);
    if (automationStudioAcceptedStateDigest(recorded.binding).digest !== automationStudioAcceptedStateDigest(binding).digest) throw new Error("staged_authority.corrupt_result");
    let originalRequest: AutomationStudioAcceptedStateRequest;
    if (operationKind === "staged_project.initial") originalRequest = { kind: "initial", snapshot: recorded.snapshot! };
    else {
      const previous = await this.readHistorical(binding.projectId, binding.epoch, binding.generation - 1);
      if (previous.binding.state !== "staged") throw new Error("staged_authority.corrupt_previous_snapshot");
      if (operationKind === "staged_project.replace") originalRequest = { kind: "replace", expectedBinding: previous.binding, snapshot: recorded.snapshot! };
      else {
        if (automationStudioAcceptedStateDigest(recorded.tombstone!.previousBinding).digest !== automationStudioAcceptedStateDigest(previous.binding).digest) throw new Error("staged_authority.corrupt_previous_snapshot");
        originalRequest = { kind: "tombstone", expectedBinding: previous.binding, reasonCode: recorded.tombstone!.reasonCode };
      }
    }
    // Hash the original bounded request reconstructed from immutable rows; an unrelated valid receipt is insufficient.
    if (this.prepare(originalRequest).requestDigest !== requestDigest) throw new Error("staged_authority.corrupt_request_join");
  }
  private async readHistorical(projectId: string, epoch: string, generation: number): Promise<AutomationStudioAcceptedStateCurrent> {
    const row = await this.lease.database.get<{ payload_json: string; payload_kind: "state" | "tombstone"; digest: string }>("select payload_json,payload_kind,digest from accepted_project_snapshots where project_id=? and epoch=? and generation=?", [projectId, epoch, generation]);
    if (!row) throw new Error("staged_authority.corrupt_previous_snapshot");
    return this.decode({ project_id: projectId, epoch, generation, digest: row.digest, state: row.payload_kind === "state" ? "staged" : "tombstoned", payload_kind: row.payload_kind, payload_json: row.payload_json, snapshot_digest: row.digest });
  }
  private async read(sql: AutomationStudioSqlExecutor): Promise<AutomationStudioAcceptedStateCurrent | null> {
    // LEFT JOIN deliberately exposes a corrupt/dangling head instead of treating it as absent.
    const row = await sql.get<Row>("select h.project_id,h.epoch,h.generation,h.digest,h.state,s.payload_kind,s.payload_json,s.digest as snapshot_digest from accepted_project_heads h left join accepted_project_snapshots s on s.project_id=h.project_id and s.epoch=h.epoch and s.generation=h.generation and s.digest=h.digest where h.project_id=?", [this.lease.projectId]);
    return row ? this.decode(row) : null;
  }
  private decode(row: Row): AutomationStudioAcceptedStateCurrent {
    const binding: AutomationStudioAcceptedStateBinding = { projectId: row.project_id, epoch: row.epoch, generation: row.generation, digest: row.digest, state: row.state };
    Validation.binding(binding, this.lease.projectId);
    if (!row.payload_json || row.snapshot_digest !== row.digest || automationStudioAcceptedStateDigest(JSON.parse(row.payload_json)).digest !== row.digest) throw new Error("staged_authority.corrupt_snapshot");
    if (row.state === "staged" && row.payload_kind === "state") {
      const snapshot = Validation.snapshot(JSON.parse(row.payload_json) as AutomationStudioAcceptedProjectSnapshot, this.lease.projectId);
      return { binding, snapshot, tombstone: null, vector: Validation.vector(snapshot, binding.epoch, binding.generation), productionAuthority: "unsupported" };
    }
    if (row.state === "tombstoned" && row.payload_kind === "tombstone") {
      const tombstone = JSON.parse(row.payload_json) as AutomationStudioAcceptedStateTombstone;
      Validation.binding(tombstone.previousBinding, this.lease.projectId); Validation.id(tombstone.reasonCode);
      if (tombstone.schemaVersion !== "staged_project_tombstone.v1" || tombstone.previousBinding.epoch !== binding.epoch || tombstone.previousBinding.generation + 1 !== binding.generation || tombstone.previousBinding.state !== "staged") throw new Error("staged_authority.corrupt_tombstone");
      return { binding, snapshot: null, tombstone, vector: [], productionAuthority: "unsupported" };
    }
    throw new Error("staged_authority.corrupt_head");
  }
}
