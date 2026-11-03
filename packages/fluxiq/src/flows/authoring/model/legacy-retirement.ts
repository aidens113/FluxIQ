import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioProjectArtifacts } from "./artifacts.ts";

export const AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION = "0.2" as const;

export type AutomationStudioLegacyRetirementPhase = "compatibility" | "write_locked";

export type AutomationStudioLegacyImporterEvidence = {
  packageId: string;
  packageVersion: string;
  status: "validated" | "deferred";
  note?: string;
};

export type AutomationStudioLegacyDeferredArtifact = {
  kind: "task" | "routine";
  artifactId: string;
  reason: string;
};

export type AutomationStudioLegacyRetirementState = {
  schemaVersion: "0.1";
  projectId: string;
  projectSchemaVersion: "0.1" | typeof AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION;
  phase: AutomationStudioLegacyRetirementPhase;
  importerEvidence: AutomationStudioLegacyImporterEvidence[];
  intentionallyDeferred: AutomationStudioLegacyDeferredArtifact[];
  importerCoverageAcknowledged: boolean;
  backupRestoreVerifiedAt?: number;
  verifiedBackupId?: string;
  sealedAt?: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioLegacyRetirementCriterion = {
  id: "importers" | "inventory" | "backup_restore" | "flow_first_docs" | "support_runbook";
  satisfied: boolean;
  detail: string;
};

export type AutomationStudioLegacyRetirementDiagnostic = {
  code: "legacy.compatibility_write" | "legacy.write_locked";
  deprecated: true;
  replacement: "canonical-flow-api";
  projectSchemaVersion: string;
  phase: AutomationStudioLegacyRetirementPhase;
  message: string;
};

export type AutomationStudioLegacyRetirementReport = {
  schemaVersion: "0.1";
  projectId: string;
  state: AutomationStudioLegacyRetirementState;
  counts: { tasks: number; routines: number; legacyFlows: number; canonicalFlows: number };
  unmigrated: Array<{ kind: "task" | "routine"; artifactId: string; flowId: string }>;
  deferred: AutomationStudioLegacyDeferredArtifact[];
  criteria: AutomationStudioLegacyRetirementCriterion[];
  canLockWrites: boolean;
  diagnostic: AutomationStudioLegacyRetirementDiagnostic;
  inspectedAt: number;
};

export type AutomationStudioLegacyBackup = {
  schemaVersion: "0.1";
  backupId: string;
  projectId: string;
  digest: string;
  artifacts: AutomationStudioProjectArtifacts;
  createdAt: number;
};

export type AutomationStudioLegacyRetirementAuditEvent = {
  eventId: string;
  projectId: string;
  type: "backup_created" | "backup_verified" | "migration_applied" | "rollback_applied" | "evidence_updated" | "writes_locked";
  timestamp: number;
  details: JsonObject;
};

export type AutomationStudioFlowMigrationRollbackPlan = {
  schemaVersion: "0.1";
  projectId: string;
  migrationId: string;
  backupId: string;
  status: "ready" | "blocked" | "applied";
  flowIds: string[];
  blockers: string[];
  generatedAt: number;
};

/** Structured error retained across compatibility endpoints. */
export class AutomationStudioLegacyWriteDisabledError extends Error {
  readonly code = "legacy.write_locked" as const;
  constructor(readonly diagnostic: AutomationStudioLegacyRetirementDiagnostic) {
    super(diagnostic.message);
    this.name = "AutomationStudioLegacyWriteDisabledError";
  }
}
