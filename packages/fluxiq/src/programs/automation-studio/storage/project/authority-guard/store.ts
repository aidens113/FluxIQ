import type { AutomationStudioProjectDatabaseLease, AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioProjectUnitOfWork } from "../unit-of-work.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { AUTOMATION_STUDIO_AUTHORITY_GUARD_MIGRATION } from "./migration.ts";
import { AutomationStudioAuthorityGuardValidation as V } from "./validation.ts";
import { AutomationStudioAuthorityGuardRecords as Records } from "./records.ts";
import type { AuthorityGuardCaptureIdentity, AuthorityGuardCaptureRecord, AuthorityGuardCaptureRequest, AuthorityGuardCaptureReleaseOwner, AuthorityGuardClaim, AuthorityGuardCompletion, AuthorityGuardCompletionCapability, AuthorityGuardLegacyOutcome, AuthorityGuardLegacyRecord, AuthorityGuardLegacyRequest, AuthorityGuardOpenOptions, AuthorityGuardUnknownReason } from "./contracts.ts";

/** Coordination infrastructure; opening creates/migrates SQL, not project authority. */
export class AutomationStudioProjectAuthorityGuardStore {
  private readonly capabilities = new WeakMap<object, AuthorityGuardLegacyRequest>();
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease, private readonly unit: AutomationStudioProjectUnitOfWork, private readonly releaseOwner?: AuthorityGuardCaptureReleaseOwner) {}
  static async open(input: AuthorityGuardOpenOptions): Promise<AutomationStudioProjectAuthorityGuardStore> {
    const projectId = input.projectId, pool = input.pool; V.id(projectId);
    const releaseOwner = input.captureReleaseOwner ? Object.freeze({ ownerKind: input.captureReleaseOwner.ownerKind, ownerId: input.captureReleaseOwner.ownerId, protocolVersion: input.captureReleaseOwner.protocolVersion, verifyReadOnlyRelease: input.captureReleaseOwner.verifyReadOnlyRelease.bind(input.captureReleaseOwner) }) : undefined;
    if (releaseOwner) { V.id(releaseOwner.ownerKind); V.id(releaseOwner.ownerId); if (releaseOwner.protocolVersion !== 1 || typeof releaseOwner.verifyReadOnlyRelease !== "function") throw new Error("authority_guard.release_owner"); }
    const lease = await pool.acquire(projectId); let unit: AutomationStudioProjectUnitOfWork | undefined;
    try { await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_AUTHORITY_GUARD_MIGRATION] }).migrate(); unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId }); return new AutomationStudioProjectAuthorityGuardStore(lease, unit, releaseOwner); }
    catch (error) { await unit?.close(); await lease.release(); throw error; }
  }
  async close(): Promise<void> { try { await this.unit.close(); } finally { await this.lease.release(); } }
  readState() { return this.lease.database.transaction(sql => new Records(this.lease.projectId, sql).state()); }
  reconcileLegacy(input: AuthorityGuardLegacyRequest): Promise<AuthorityGuardLegacyRecord | null> { const request = V.legacy(input, this.lease.projectId); return this.lease.database.transaction(sql => new Records(this.lease.projectId, sql).legacy(request)); }
  reconcileCapture(input: AuthorityGuardCaptureRequest): Promise<AuthorityGuardCaptureRecord | null> { const request = V.capture(input, this.lease.projectId); return this.lease.database.transaction(sql => new Records(this.lease.projectId, sql).capture(request)); }
  async claimLegacy(input: AuthorityGuardLegacyRequest): Promise<AuthorityGuardClaim> {
    const request = V.legacy(input, this.lease.projectId);
    const replay = await this.reconcileLegacy(request); if (replay) return { executionAllowed: false, record: replay };
    const outcome = await this.mutate(request, "legacy.claim", null, async (sql, now) => {
      const records = new Records(this.lease.projectId, sql); const state = await records.state();
      if (state && (state.mode !== "legacy" || state.completedRevision !== request.expectedRevision) || !state && request.expectedRevision !== 0) throw new Error("authority_guard.claim_conflict");
      if (await records.unresolved()) throw new Error("authority_guard.unresolved_legacy");
      if (!state) await sql.run("insert into authority_guard_projects values(?,1,'legacy',0,null,null)", [request.projectId]);
      const base = { request, baseRevision: request.expectedRevision, claimedAt: now, predecessorKey: state?.lastCompletedOperationKey ?? null };
      const claim = { ...base, claimDigest: V.digest(base) };
      await sql.run("insert into authority_guard_legacy(operation_key,project_id,request_json,claim_json,predecessor_key) values(?,?,?,?,?)", [request.operationKey, request.projectId, JSON.stringify(request), JSON.stringify(claim), base.predecessorKey]);
      return V.digest(claim);
    });
    const record = await this.reconcileLegacy(request); if (!record) throw new Error("authority_guard.missing_claim");
    if (outcome.replayed) return { executionAllowed: false, record };
    const capability = Object.freeze({}) as AuthorityGuardCompletionCapability; this.capabilities.set(capability, request);
    return { executionAllowed: true, record, capability };
  }
  async completeLegacy(capability: AuthorityGuardCompletionCapability, input: { resultDigest: string }): Promise<AuthorityGuardCompletion> {
    V.closed(input, ["resultDigest"]); V.hash(input.resultDigest); const resultDigest = input.resultDigest; const request = this.owned(capability);
    await this.mutate(request, "legacy.complete", { resultDigest }, async (sql, now) => {
      const records = new Records(this.lease.projectId, sql, `${request.operationKey}:legacy.complete`), record = await records.legacy(request), state = await records.state();
      if (!record || !state || state.mode !== "legacy" || state.completedRevision !== record.baseRevision) throw new Error("authority_guard.completion_conflict");
      const completedRevision = record.baseRevision + 1; V.integer(completedRevision);
      const base = { projectId: request.projectId, operationKey: request.operationKey, claimDigest: record.claimDigest, ownerKind: request.ownerKind, ownerId: request.ownerId, operationKind: request.operationKind, requestDigest: request.requestDigest, previousRevision: record.baseRevision, completedRevision, resultDigest, completedAt: now };
      const receipt = { ...base, receiptDigest: V.digest(base) };
      await sql.run("update authority_guard_legacy set completion_json=?,completed_revision=? where operation_key=?", [JSON.stringify(receipt), completedRevision, request.operationKey]);
      await sql.run("update authority_guard_projects set revision=?,last_operation_key=? where project_id=?", [completedRevision, request.operationKey, request.projectId]);
      return V.digest(receipt);
    });
    const record = await this.reconcileLegacy(request); if (!record?.completion || record.completion.resultDigest !== resultDigest) throw new Error("authority_guard.completion_receipt"); return record.completion;
  }
  async markLegacyUnknown(capability: AuthorityGuardCompletionCapability, reason: AuthorityGuardUnknownReason): Promise<void> {
    V.unknown(reason); const request = this.owned(capability), existing = await this.reconcileLegacy(request); if (existing?.completion) return;
    try { await this.mutate(request, "legacy.unknown", { reason }, async (sql, now) => {
      const record = await new Records(this.lease.projectId, sql, `${request.operationKey}:legacy.unknown`).legacy(request); if (!record) throw new Error("authority_guard.missing_claim");
      if (record.completion) throw new Error("authority_guard.already_completed");
      const unknown = { reason, markedAt: now, claimDigest: record.claimDigest };
      await sql.run("update authority_guard_legacy set unknown_json=? where operation_key=?", [JSON.stringify(unknown), request.operationKey]); return V.digest(unknown);
    }); } catch (error) { if (!(await this.reconcileLegacy(request))?.completion) throw error; }
    await this.reconcileLegacy(request);
  }
  async runLegacyMutation<T>(input: AuthorityGuardLegacyRequest, operation: () => Promise<{ value: T; resultDigest: string }>): Promise<AuthorityGuardLegacyOutcome<T>> {
    const request = V.legacy(input, this.lease.projectId), claim = await this.claimLegacy(request);
    if (!claim.executionAllowed) return claim.record.completion ? { status: "result_unavailable", receipt: claim.record.completion } : { status: "outcome_unknown" };
    let value: T, resultDigest: string;
    try { const answer = await operation(); if (!answer || Object.getPrototypeOf(answer) !== Object.prototype || Object.keys(answer).sort().join("|") !== "resultDigest|value" || Object.getOwnPropertySymbols(answer).length || Object.values(Object.getOwnPropertyDescriptors(answer)).some(field => !("value" in field) || !field.enumerable)) throw new Error("authority_guard.producer_envelope"); V.hash(answer.resultDigest); resultDigest = answer.resultDigest; value = answer.value; }
    catch (error) { try { await this.markLegacyUnknown(claim.capability, "effect_uncertain"); } catch (persistenceError) { throw new AggregateError([error, persistenceError], "authority_guard.unknown_persistence_failed"); } throw error; }
    try { const receipt = await this.completeLegacy(claim.capability, { resultDigest: resultDigest }); return { status: "completed", value, receipt }; }
    catch { const found = await this.reconcileLegacy(request); if (found?.completion && found.completion.resultDigest === resultDigest) return { status: "completed", value, receipt: found.completion }; await this.markLegacyUnknown(claim.capability, "completion_uncertain"); return { status: "outcome_unknown" }; }
  }
  async beginCapture(input: AuthorityGuardCaptureRequest): Promise<{ acquired: boolean; record: AuthorityGuardCaptureRecord }> {
    const request = V.capture(input, this.lease.projectId), replay = await this.reconcileCapture(request); if (replay) return { acquired: false, record: replay };
    const outcome = await this.mutate(request, "capture.begin", null, async (sql, now) => {
      const records = new Records(this.lease.projectId, sql), state = await records.state();
      if (state && (state.mode !== "legacy" || state.completedRevision !== request.expectedRevision) || !state && request.expectedRevision !== 0 || await records.unresolved()) throw new Error("authority_guard.capture_conflict");
      if (!state) await sql.run("insert into authority_guard_projects values(?,1,'legacy',0,null,null)", [request.projectId]);
      const base = { request, capturedRevision: request.expectedRevision, acquiredAt: now }; const captured = { ...base, captureDigest: V.digest(base) };
      await sql.run("insert into authority_guard_captures(capture_key,project_id,request_json,capture_json) values(?,?,?,?)", [request.captureKey, request.projectId, JSON.stringify(request), JSON.stringify(captured)]);
      await sql.run("update authority_guard_projects set mode='capturing',capture_key=? where project_id=?", [request.captureKey, request.projectId]); return V.digest(captured);
    });
    const record = await this.reconcileCapture(request); if (!record) throw new Error("authority_guard.missing_capture"); return { acquired: !outcome.replayed, record };
  }
  async releaseCapture(input: AuthorityGuardCaptureIdentity): Promise<AuthorityGuardCaptureRecord> {
    const identity = V.identity(input), captured = await this.captureByIdentity(identity); if (captured.release) return captured;
    const owner = this.releaseOwner; if (!owner || owner.ownerKind !== captured.request.ownerKind || owner.ownerId !== captured.request.ownerId || owner.protocolVersion !== captured.request.protocolVersion) throw new Error("authority_guard.release_owner_unavailable");
    const proof = V.clone(await owner.verifyReadOnlyRelease(V.clone(captured))); V.closed(proof, ["evidenceDigest"]); V.hash(proof.evidenceDigest);
    await this.mutate(captured.request, "capture.release", { identity, evidenceDigest: proof.evidenceDigest }, async (sql, now) => {
      const records = new Records(this.lease.projectId, sql, `${captured.request.captureKey}:capture.release`), record = await records.capture(captured.request), state = await records.state();
      if (!record || record.release || !state || state.mode !== "capturing" || state.activeCaptureKey !== identity.captureKey || state.completedRevision !== record.capturedRevision || record.captureDigest !== identity.captureDigest) throw new Error("authority_guard.release_conflict");
      const base = { captureDigest: identity.captureDigest, ownerKind: identity.ownerKind, ownerId: identity.ownerId, requestDigest: identity.requestDigest, releasedAt: now, evidenceDigest: proof.evidenceDigest }; const receipt = { ...base, receiptDigest: V.digest(base) };
      await sql.run("update authority_guard_captures set release_json=? where capture_key=?", [JSON.stringify(receipt), identity.captureKey]);
      await sql.run("update authority_guard_projects set mode='legacy',capture_key=null where project_id=?", [this.lease.projectId]); return V.digest(receipt);
    });
    return this.captureByIdentity(identity);
  }
  async markCaptureUnknown(input: AuthorityGuardCaptureIdentity, reason: AuthorityGuardUnknownReason): Promise<void> {
    const identity = V.identity(input); V.unknown(reason); const captured = await this.captureByIdentity(identity); if (captured.release) return;
    try { await this.mutate(captured.request, "capture.unknown", { reason }, async (sql, now) => {
      const record = await new Records(this.lease.projectId, sql, `${captured.request.captureKey}:capture.unknown`).capture(captured.request); if (!record) throw new Error("authority_guard.missing_capture");
      if (record.release) throw new Error("authority_guard.already_released");
      const unknown = { reason, markedAt: now, captureDigest: record.captureDigest }; await sql.run("update authority_guard_captures set unknown_json=? where capture_key=?", [JSON.stringify(unknown), identity.captureKey]); return V.digest(unknown);
    }); } catch (error) { if (!(await this.captureByIdentity(identity)).release) throw error; }
    await this.captureByIdentity(identity);
  }
  private owned(capability: AuthorityGuardCompletionCapability): AuthorityGuardLegacyRequest { const request = this.capabilities.get(capability); if (!request) throw new Error("authority_guard.completion_owner"); return request; }
  private async captureByIdentity(identity: AuthorityGuardCaptureIdentity): Promise<AuthorityGuardCaptureRecord> {
    return this.lease.database.transaction(async sql => { const record = await new Records(this.lease.projectId, sql).captureKey(identity.captureKey); if (!record || record.captureDigest !== identity.captureDigest || record.request.ownerKind !== identity.ownerKind || record.request.ownerId !== identity.ownerId || record.request.requestDigest !== identity.requestDigest) throw new Error("authority_guard.capture_owner"); return record; });
  }
  private mutate(request: AuthorityGuardLegacyRequest | AuthorityGuardCaptureRequest, operation: string, input: unknown, run: (sql: AutomationStudioSqlExecutor, now: number) => Promise<string>) {
    const key = "operationKey" in request ? request.operationKey : request.captureKey;
    return this.unit.runIdempotent({ mutationId: `authority_guard:${key}:${operation}`, operationKind: `authority_guard.${operation}`, ownerKind: request.ownerKind, ownerId: request.ownerId, requestDigest: V.digest({ request, operation, input }) }, async context => ({ key, operation, proofDigest: await run(context.sql, context.changedAt) }));
  }
}
