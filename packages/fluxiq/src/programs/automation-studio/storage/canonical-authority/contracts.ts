import type { AuthorityGuardCompletion, AuthorityGuardLegacyRequest } from "../project/authority-guard/index.ts";

export type CanonicalAuthorityKind = "automation.flows" | "automation.flow_publications";
export type CanonicalAuthorityOptions = { projectRootDir: string; projectDatabaseRootDir: string };
export type CanonicalAuthorityDomainConstraint = { kind: "any" } | { kind: "exact"; domainId: string | null };
export type CanonicalAuthorityOwner = { protocolVersion: 1; kind: CanonicalAuthorityKind; resourceId: string; originalProjectId: string; ownerRevision: number; tombstoned: boolean };
export type CanonicalAuthorityRequest = { protocolVersion: 1; operationKey: string; kind: CanonicalAuthorityKind; resourceId: string; method: "put" | "delete"; originalProjectId: string; baseOwnerRevision: number; domainConstraint: CanonicalAuthorityDomainConstraint; documentDigest: string; requestDigest: string };
export type CanonicalAuthorityEffect = { protocolVersion: 1; operationKey: string; requestDigest: string; claimDigest: string; kind: CanonicalAuthorityKind; resourceId: string; originalProjectId: string; previousOwnerRevision: number; completedOwnerRevision: number; documentDigest: string; resultDigest: string; effectedAt: number; receiptDigest: string };
export type CanonicalAuthorityOperation = { request: CanonicalAuthorityRequest; claimDigest: string; phase: "reserved" | "project_claimed" | "effect_applied" | "completed" | "unknown"; projectRequest: AuthorityGuardLegacyRequest | null; projectClaimDigest: string | null; effect: CanonicalAuthorityEffect | null; projectReceipt: AuthorityGuardCompletion | null };
declare const operationCapability: unique symbol;
export type CanonicalAuthorityCapability = { readonly [operationCapability]: true };
