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

export type CanonicalWholeOperationKind = "project.create" | "flow.create" | "flow.save";
export type CanonicalWholeEffectKind = "catalogue_membership" | "project_manifest" | "project_hierarchy_nodes" | "project_hierarchy_deleted" | "project_preferences" | "canonical_flow" | "project_flow_document" | "flow_membership" | "flow_source" | "generated_config" | "sql_flow_metadata" | "project_change_feed";
export type CanonicalWholeRequest = { recordKind: "whole_writer"; wholeProtocol: "fluxiq.canonical-whole.v1"; operationKey: string; operationKind: CanonicalWholeOperationKind; originalProjectId: string; baseLifecycleRevision: number; flowIdentity: null | { flowId: string; baseOwnerRevision: number; allocation: "generated" | "existing" }; requestDigest: string; effectPlanDigest: string };
export type CanonicalWholeEffect = { effectKind: CanonicalWholeEffectKind; entityId: string; expectedDigest: string; actualDigest: string; receiptDigest: string; effectedAt: number };
declare const wholeCapability: unique symbol;
export type CanonicalWholeCapability = { readonly [wholeCapability]: true };
declare const wholeSqlCapability: unique symbol;
export type CanonicalWholeSqlCapability = { readonly [wholeSqlCapability]: true };
export type CanonicalProjectLifecycle = { protocolVersion: 1; originalProjectId: string; status: "creating" | "active" | "deleting" | "tombstoned"; revision: number; catalogueDigest: string; pendingOperationKey: string | null };
