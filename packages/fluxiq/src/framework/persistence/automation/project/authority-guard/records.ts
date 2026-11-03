import type { AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioAuthorityGuardValidation as V } from "./validation.ts";
import type { AuthorityGuardCaptureRecord, AuthorityGuardCaptureRequest, AuthorityGuardCaptureRelease, AuthorityGuardCompletion, AuthorityGuardLegacyRecord, AuthorityGuardLegacyRequest, AuthorityGuardState, AuthorityGuardUnknownReason } from "./contracts.ts";

type LegacyRow = { operation_key: string; project_id: string; request_json: string; claim_json: string; predecessor_key: string | null; unknown_json: string | null; completion_json: string | null; completed_revision: number | null };
type CaptureRow = { capture_key: string; project_id: string; request_json: string; capture_json: string; unknown_json: string | null; release_json: string | null };
type Claim = { request: AuthorityGuardLegacyRequest; baseRevision: number; claimedAt: number; predecessorKey: string | null; claimDigest: string };
type Captured = { request: AuthorityGuardCaptureRequest; capturedRevision: number; acquiredAt: number; captureDigest: string };

/** Validates historical records and their durable mutation joins; never grants IO. */
export class AutomationStudioAuthorityGuardRecords {
  private readonly checked = new Map<string, Promise<AuthorityGuardLegacyRecord | null>>();
  private readonly checking = new Set<string>();
  constructor(private readonly projectId: string, private readonly sql: AutomationStudioSqlExecutor, private readonly inflightMutation?: string) {}
  async state(): Promise<AuthorityGuardState | null> {
    const row = await this.sql.get<{ project_id: string; protocol_version: number; mode: "legacy" | "capturing"; revision: number; last_operation_key: string | null; capture_key: string | null }>("select * from authority_guard_projects where project_id=?", [this.projectId]);
    const count = await this.sql.get<{ n: number }>("select (select count(*) from authority_guard_legacy)+(select count(*) from authority_guard_captures) as n");
    if ((count?.n ?? 0) > 4096) throw new Error("authority_guard.history_bound");
    if (!row) { if (count?.n) throw new Error("authority_guard.missing_state"); return null; }
    V.integer(row.revision); if (row.project_id !== this.projectId || row.protocol_version !== 1 || !["legacy", "capturing"].includes(row.mode)) throw new Error("authority_guard.corrupt_state");
    const completions = await this.sql.all<{ operation_key: string; completed_revision: number }>("select operation_key,completed_revision from authority_guard_legacy where completed_revision is not null order by completed_revision");
    if (completions.length !== row.revision || row.last_operation_key !== (completions.at(-1)?.operation_key ?? null)) throw new Error("authority_guard.head_history");
    for (let i = 0; i < completions.length; i++) { if (completions[i]!.completed_revision !== i + 1) throw new Error("authority_guard.revision_history"); await this.legacyKey(completions[i]!.operation_key); }
    const claims = await this.sql.all<{ operation_key: string }>("select operation_key from authority_guard_legacy where completed_revision is null");
    for (const claim of claims) { const record = await this.legacyKey(claim.operation_key); if (!record || record.baseRevision !== row.revision) throw new Error("authority_guard.pending_revision"); }
    const captures = await this.sql.all<{ capture_key: string }>("select capture_key from authority_guard_captures"); let pending = 0;
    for (const capture of captures) { const record = await this.captureKey(capture.capture_key); if (!record) throw new Error("authority_guard.missing_capture"); if (!record.release) { pending++; if (capture.capture_key !== row.capture_key || record.capturedRevision !== row.revision) throw new Error("authority_guard.capture_head"); } }
    if (row.mode === "legacy" ? row.capture_key !== null || pending !== 0 : !row.capture_key || pending !== 1 || claims.length !== 0) throw new Error("authority_guard.mode_history");
    return V.clone({ projectId: row.project_id, protocolVersion: 1, mode: row.mode, completedRevision: row.revision, lastCompletedOperationKey: row.last_operation_key, activeCaptureKey: row.capture_key });
  }
  async unresolved(): Promise<boolean> { const inventory = await this.sql.get<{ n: number }>("select (select count(*) from authority_guard_legacy)+(select count(*) from authority_guard_captures) as n"); if ((inventory?.n ?? 0) >= 4096) throw new Error("authority_guard.history_bound"); const rows = await this.sql.get<{ n: number }>("select count(*) as n from authority_guard_legacy where completion_json is null"); return (rows?.n ?? 0) > 0; }
  async legacy(request: AuthorityGuardLegacyRequest): Promise<AuthorityGuardLegacyRecord | null> { const record = await this.legacyKey(request.operationKey); if (record && V.digest(record.request) !== V.digest(request)) throw new Error("authority_guard.request_conflict"); return record; }
  legacyKey(key: string, depth = 0): Promise<AuthorityGuardLegacyRecord | null> {
    if (this.checking.has(key)) return Promise.reject(new Error("authority_guard.history_cycle"));
    const prior = this.checked.get(key); if (prior) return prior;
    this.checking.add(key); const current = this.readLegacyKey(key, depth).finally(() => this.checking.delete(key)); this.checked.set(key, current); return current;
  }
  private async readLegacyKey(key: string, depth: number): Promise<AuthorityGuardLegacyRecord | null> {
    if (depth > 4096) throw new Error("authority_guard.history_bound");
    const row = await this.sql.get<LegacyRow>("select * from authority_guard_legacy where operation_key=?", [key]);
    if (!row) { await this.absent(key, ["legacy.claim", "legacy.complete", "legacy.unknown"]); return null; }
    const request = V.legacy(V.decode<AuthorityGuardLegacyRequest>(row.request_json), this.projectId), claim = V.decode<Claim>(row.claim_json);
    V.closed(claim, ["request", "baseRevision", "claimedAt", "predecessorKey", "claimDigest"]); V.integer(claim.claimedAt); V.integer(claim.baseRevision); V.hash(claim.claimDigest);
    const { claimDigest, ...base } = claim;
    if (row.project_id !== this.projectId || row.operation_key !== request.operationKey || V.digest(claim.request) !== V.digest(request) || claim.baseRevision !== request.expectedRevision || claim.predecessorKey !== row.predecessor_key || claimDigest !== V.digest(base)) throw new Error("authority_guard.corrupt_claim");
    await this.mutation(request, "legacy.claim", null, V.digest(claim));
    if (claim.baseRevision === 0 ? claim.predecessorKey !== null : !claim.predecessorKey) throw new Error("authority_guard.predecessor");
    if (claim.predecessorKey) { const predecessor = await this.legacyKey(claim.predecessorKey, depth + 1); if (!predecessor?.completion || predecessor.completion.completedRevision !== claim.baseRevision) throw new Error("authority_guard.predecessor"); }
    let completion: AuthorityGuardCompletion | null = null;
    if (row.completion_json) {
      completion = V.decode<AuthorityGuardCompletion>(row.completion_json); V.closed(completion, ["projectId", "operationKey", "claimDigest", "ownerKind", "ownerId", "operationKind", "requestDigest", "previousRevision", "completedRevision", "resultDigest", "completedAt", "receiptDigest"]);
      V.hash(completion.resultDigest); V.integer(completion.completedAt); V.integer(completion.completedRevision); const { receiptDigest, ...payload } = completion;
      if (completion.projectId !== this.projectId || completion.operationKey !== request.operationKey || completion.claimDigest !== claimDigest || completion.ownerKind !== request.ownerKind || completion.ownerId !== request.ownerId || completion.operationKind !== request.operationKind || completion.requestDigest !== request.requestDigest || completion.previousRevision !== claim.baseRevision || completion.completedRevision !== claim.baseRevision + 1 || row.completed_revision !== completion.completedRevision || receiptDigest !== V.digest(payload)) throw new Error("authority_guard.corrupt_completion");
      await this.mutation(request, "legacy.complete", { resultDigest: completion.resultDigest }, V.digest(completion));
    } else { if (row.completed_revision !== null) throw new Error("authority_guard.missing_completion"); await this.absent(key, ["legacy.complete"]); }
    let unknownReason: AuthorityGuardUnknownReason | null = null;
    if (row.unknown_json) { const unknown = V.decode<{ reason: AuthorityGuardUnknownReason; markedAt: number; claimDigest: string }>(row.unknown_json); V.closed(unknown, ["reason", "markedAt", "claimDigest"]); V.unknown(unknown.reason); V.integer(unknown.markedAt); if (unknown.claimDigest !== claimDigest) throw new Error("authority_guard.corrupt_unknown"); await this.mutation(request, "legacy.unknown", { reason: unknown.reason }, V.digest(unknown)); unknownReason = unknown.reason; }
    else await this.absent(key, ["legacy.unknown"]);
    return V.clone({ request, baseRevision: claim.baseRevision, claimedAt: claim.claimedAt, claimDigest, state: completion ? "completed" : unknownReason ? "unknown" : "pending", unknownReason: completion ? null : unknownReason, completion });
  }
  async capture(request: AuthorityGuardCaptureRequest): Promise<AuthorityGuardCaptureRecord | null> { const record = await this.captureKey(request.captureKey); if (record && V.digest(record.request) !== V.digest(request)) throw new Error("authority_guard.request_conflict"); return record; }
  async captureKey(key: string): Promise<AuthorityGuardCaptureRecord | null> {
    const row = await this.sql.get<CaptureRow>("select * from authority_guard_captures where capture_key=?", [key]); if (!row) { await this.absent(key, ["capture.begin", "capture.release", "capture.unknown"]); return null; }
    const request = V.capture(V.decode<AuthorityGuardCaptureRequest>(row.request_json), this.projectId), captured = V.decode<Captured>(row.capture_json);
    V.closed(captured, ["request", "capturedRevision", "acquiredAt", "captureDigest"]); V.integer(captured.acquiredAt); V.integer(captured.capturedRevision);
    const { captureDigest, ...base } = captured;
    if (row.project_id !== this.projectId || row.capture_key !== request.captureKey || V.digest(captured.request) !== V.digest(request) || captured.capturedRevision !== request.expectedRevision || captureDigest !== V.digest(base)) throw new Error("authority_guard.corrupt_capture");
    await this.mutation(request, "capture.begin", null, V.digest(captured));
    let release: AuthorityGuardCaptureRelease | null = null;
    if (row.release_json) {
      release = V.decode<AuthorityGuardCaptureRelease>(row.release_json); V.closed(release, ["captureDigest", "ownerKind", "ownerId", "requestDigest", "releasedAt", "evidenceDigest", "receiptDigest"]); V.hash(release.evidenceDigest); V.integer(release.releasedAt); const { receiptDigest, ...payload } = release;
      if (release.captureDigest !== captureDigest || release.ownerKind !== request.ownerKind || release.ownerId !== request.ownerId || release.requestDigest !== request.requestDigest || receiptDigest !== V.digest(payload)) throw new Error("authority_guard.corrupt_release");
      await this.mutation(request, "capture.release", { identity: { captureKey: key, ownerKind: request.ownerKind, ownerId: request.ownerId, requestDigest: request.requestDigest, captureDigest }, evidenceDigest: release.evidenceDigest }, V.digest(release));
    } else await this.absent(key, ["capture.release"]);
    let unknown = false;
    if (row.unknown_json) { const marked = V.decode<{ reason: AuthorityGuardUnknownReason; markedAt: number; captureDigest: string }>(row.unknown_json); V.closed(marked, ["reason", "markedAt", "captureDigest"]); V.unknown(marked.reason); V.integer(marked.markedAt); if (marked.captureDigest !== captureDigest) throw new Error("authority_guard.corrupt_capture_unknown"); await this.mutation(request, "capture.unknown", { reason: marked.reason }, V.digest(marked)); unknown = true; }
    else await this.absent(key, ["capture.unknown"]);
    return V.clone({ request, capturedRevision: captured.capturedRevision, captureDigest, acquiredAt: captured.acquiredAt, state: release ? "released" : unknown ? "unknown" : "capturing", release });
  }
  async mutation(request: AuthorityGuardLegacyRequest | AuthorityGuardCaptureRequest, operation: string, input: unknown, proofDigest: string): Promise<void> {
    const key = "operationKey" in request ? request.operationKey : request.captureKey;
    const row = await this.sql.get<{ owner_kind: string; owner_id: string; operation_kind: string; request_digest: string; status: string; response_json: string | null }>("select * from mutation_records where mutation_id=?", [`authority_guard:${key}:${operation}`]);
    const response = row?.response_json ? V.decode(row.response_json) : null;
    if (!row || row.owner_kind !== request.ownerKind || row.owner_id !== request.ownerId || row.operation_kind !== `authority_guard.${operation}` || row.request_digest !== V.digest({ request, operation, input }) || row.status !== "committed" || V.digest(response) !== V.digest({ key, operation, proofDigest })) throw new Error("authority_guard.corrupt_mutation_join");
  }
  private async absent(key: string, operations: string[]) { for (const operation of operations) { const row = await this.sql.get<{ status: string }>("select status from mutation_records where mutation_id=?", [`authority_guard:${key}:${operation}`]); if (row && row.status !== "failed" && !(row.status === "started" && this.inflightMutation === `${key}:${operation}`)) throw new Error("authority_guard.missing_history_join"); } }
}
