export type AutomationStudioFlowMigrationOutcome = {
  legacyKind: "task" | "routine";
  legacyArtifactId: string;
  flowId: string;
  status: "created" | "already_migrated" | "blocked";
  message?: string;
  canonicalUpdatedAt?: number;
  canonicalDigest?: string;
};
