import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioProjectDatabasePool } from "../project/database-owner/index.ts";
import { AutomationStudioProjectAuthorityGuardStore as Guard } from "../project/authority-guard/index.ts";
import type { AuthorityGuardCompletionCapability, AuthorityGuardLegacyRequest, AuthorityGuardCompletion } from "../project/authority-guard/index.ts";
import type { CanonicalAuthorityCapability, CanonicalAuthorityKind, CanonicalAuthorityOperation, CanonicalAuthorityOptions } from "./contracts.ts";
import { CanonicalAuthorityOwnerStore } from "./owner-store.ts";
import { CanonicalAuthorityProjectExistence } from "./project-existence.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";

/** Internal joint coordinator. Local participant completion never certifies adoption. */
export class CanonicalAuthorityProjectCoordinator {
  private readonly projectDatabaseRootDir: string;
  private readonly existence: CanonicalAuthorityProjectExistence;
  constructor(private readonly owners: CanonicalAuthorityOwnerStore, options: CanonicalAuthorityOptions) {
    const fixed = V.options(options); this.projectDatabaseRootDir = fixed.projectDatabaseRootDir; this.existence = new CanonicalAuthorityProjectExistence(fixed.projectRootDir);
  }
  async mutate(kind: CanonicalAuthorityKind, id: string, method: "put" | "delete", document: JsonObject | null, domainId?: string | null): Promise<void> {
    const frozen = V.clone(document), admitted = await this.owners.reserve(kind, id, method, frozen, domainId === undefined ? { kind: "any" } : { kind: "exact", domainId });
    await this.perform(admitted, frozen);
  }
  /** Internal own-operation capability, not a join to an existing whole-writer claim. */
  async perform(admitted: { capability: CanonicalAuthorityCapability; record: CanonicalAuthorityOperation }, document: JsonObject | null, completeOperation = true): Promise<void> {
    const frozen = V.clone(document), request = this.owners.describe(admitted.capability);
    if (V.digest(request) !== V.digest(admitted.record.request)) throw new Error("canonical_authority.request_conflict");
    if (V.digest(frozen) !== request.documentDigest) throw new Error("canonical_authority.document_changed");
    await this.existence.verify(request.originalProjectId);
    await this.withGuard(request.originalProjectId, async guard => {
      let projectCapability: AuthorityGuardCompletionCapability | undefined;
      try {
      await this.existence.verify(request.originalProjectId);
      const state = await guard.readState();
      const projectRequest: AuthorityGuardLegacyRequest = { protocolVersion: 1, projectId: request.originalProjectId, ownerKind: "canonical_resource", ownerId: V.digest({ kind: request.kind, id: request.resourceId }), operationKind: `canonical.${request.method}`, operationKey: request.operationKey, requestDigest: request.requestDigest, expectedRevision: state?.completedRevision ?? 0 };
      const claim = await guard.claimLegacy(projectRequest);
      if (!claim.executionAllowed) throw new Error("canonical_authority.project_pending");
      projectCapability = claim.capability;
      await this.owners.join(admitted.capability, projectRequest, claim.record.claimDigest);
      await this.existence.verify(request.originalProjectId);
      const effect = await this.owners.effect(admitted.capability, frozen);
      // Deferred own-operation completion holds both participants; whole-writer joins are absent.
      if (!completeOperation) return;
      await guard.completeLegacy(claim.capability, { resultDigest: effect.resultDigest });
      const stored = await guard.reconcileLegacy(projectRequest);
      if (!stored?.completion || stored.completion.resultDigest !== effect.resultDigest) throw new Error("canonical_authority.project_receipt");
      await this.owners.finalize(admitted.capability, stored.completion);
      } catch (error) {
      if (projectCapability) {
        try { await guard.markLegacyUnknown(projectCapability, "effect_uncertain"); }
        catch (persistenceError) { throw new AggregateError([error, persistenceError], "canonical_authority.unknown_persistence_failed"); }
      }
      throw error;
      }
    });
  }
  /** Reconciliation reports durable participants; it never reissues pending capability or repairs. */
  async reconcile(operationKey: string): Promise<CanonicalAuthorityOperation & { projectParticipant: "not_joined" | "pending" | "unknown" | "completed"; actualProjectReceipt: AuthorityGuardCompletion | null }> {
    const record = await this.owners.reconcile(operationKey);
    if (!record.projectRequest) return { ...record, projectParticipant: "not_joined", actualProjectReceipt: null };
    await this.existence.verify(record.request.originalProjectId);
    const projectRequest = record.projectRequest;
    return this.withGuard(record.request.originalProjectId, async guard => {
      const project = await guard.reconcileLegacy(projectRequest);
      if (record.phase === "completed" && (!project?.completion || V.digest(project.completion) !== V.digest(record.projectReceipt))) throw new Error("canonical_authority.joint_completion");
      if (project?.completion && (!record.effect || project.completion.resultDigest !== record.effect.resultDigest || project.completion.claimDigest !== record.projectClaimDigest)) throw new Error("canonical_authority.participant_receipt");
      return { ...record, projectParticipant: project?.completion ? "completed" : project?.state === "unknown" ? "unknown" : "pending", actualProjectReceipt: project?.completion ?? null };
    });
  }
  async beginCapture(projectId: string, captureKey: string, expectedGlobalRevision: number): Promise<{ globalCaptureDigest: string; projectCaptureDigest: string }> {
    V.id(projectId); V.id(captureKey); V.integer(expectedGlobalRevision);
    await this.existence.verify(projectId);
    const global = await this.owners.beginFence(projectId, captureKey, expectedGlobalRevision);
    return this.withGuard(projectId, async guard => {
      await this.existence.verify(projectId); const state = await guard.readState();
      const request = { protocolVersion: 1 as const, projectId, ownerKind: "canonical_capture", ownerId: captureKey, requestDigest: global.requestDigest, expectedRevision: state?.completedRevision ?? 0, captureKey };
      const captured = await guard.beginCapture(request);
      const actual = await guard.reconcileCapture(request);
      if (!captured.acquired || !actual || actual.state !== "capturing" || actual.captureDigest !== captured.record.captureDigest) throw new Error("canonical_authority.capture_pending");
      await this.owners.bindFence(captureKey, request, actual.captureDigest);
      return { globalCaptureDigest: global.captureDigest, projectCaptureDigest: actual.captureDigest };
    });
  }
  private async withGuard<T>(projectId: string, run: (guard: Guard) => Promise<T>): Promise<T> {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: this.projectDatabaseRootDir });
    let guard: Guard | undefined, value: T | undefined; const failures: unknown[] = [];
    try { guard = await Guard.open({ pool, projectId }); value = await run(guard); }
    catch (error) { failures.push(error); }
    if (guard) { try { await guard.close(); } catch (error) { failures.push(error); } }
    try { await pool.closeAll(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "canonical_authority.operation_and_cleanup_failed");
    return value as T;
  }
}
