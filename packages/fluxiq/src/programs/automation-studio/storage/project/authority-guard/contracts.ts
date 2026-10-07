import type { AutomationStudioProjectDatabasePool } from "../database.ts";

export type AuthorityGuardOwner = { protocolVersion: 1; projectId: string; ownerKind: string; ownerId: string; requestDigest: string; expectedRevision: number };
export type AuthorityGuardLegacyRequest = AuthorityGuardOwner & { operationKey: string; operationKind: string };
export type AuthorityGuardCaptureRequest = AuthorityGuardOwner & { captureKey: string };
export type AuthorityGuardCompletion = { projectId: string; operationKey: string; claimDigest: string; ownerKind: string; ownerId: string; operationKind: string; requestDigest: string; previousRevision: number; completedRevision: number; resultDigest: string; completedAt: number; receiptDigest: string };
export type AuthorityGuardLegacyRecord = { request: AuthorityGuardLegacyRequest; baseRevision: number; claimedAt: number; claimDigest: string; state: "pending" | "unknown" | "completed"; unknownReason: AuthorityGuardUnknownReason | null; completion: AuthorityGuardCompletion | null };
export type AuthorityGuardUnknownReason = "effect_uncertain" | "completion_uncertain" | "owner_interrupted";
export type AuthorityGuardCaptureIdentity = { captureKey: string; ownerKind: string; ownerId: string; requestDigest: string; captureDigest: string };
export type AuthorityGuardCaptureRelease = { captureDigest: string; ownerKind: string; ownerId: string; requestDigest: string; releasedAt: number; evidenceDigest: string; receiptDigest: string };
export type AuthorityGuardCaptureRecord = { request: AuthorityGuardCaptureRequest; capturedRevision: number; captureDigest: string; acquiredAt: number; state: "capturing" | "unknown" | "released"; release: AuthorityGuardCaptureRelease | null };
export type AuthorityGuardState = { projectId: string; protocolVersion: 1; mode: "legacy" | "capturing"; completedRevision: number; lastCompletedOperationKey: string | null; activeCaptureKey: string | null };
declare const completionCapability: unique symbol;
export type AuthorityGuardCompletionCapability = { readonly [completionCapability]: true };
export type AuthorityGuardClaim = { executionAllowed: false; record: AuthorityGuardLegacyRecord } | { executionAllowed: true; record: AuthorityGuardLegacyRecord; capability: AuthorityGuardCompletionCapability };
export type AuthorityGuardLegacyOutcome<T> = { status: "completed"; value: T; receipt: AuthorityGuardCompletion } | { status: "result_unavailable"; receipt: AuthorityGuardCompletion } | { status: "outcome_unknown" };
export type AuthorityGuardCaptureReleaseOwner = { ownerKind: string; ownerId: string; protocolVersion: 1; verifyReadOnlyRelease(record: Readonly<AuthorityGuardCaptureRecord>): Promise<{ evidenceDigest: string }> };
export type AuthorityGuardOpenOptions = { pool: AutomationStudioProjectDatabasePool; projectId: string; captureReleaseOwner?: AuthorityGuardCaptureReleaseOwner };
