import { resolveAutomationStudioFlowCatalog, type AutomationStudioFlowMigrationOutcome } from "../../../model/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioCatalogue } from "../catalogue.ts";
import { flowScopeForProject } from "../flows/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioLegacyRetirementStore } from "./store.ts";

export type AutomationStudioFlowMigrationInspection = {
  projectId: string;
  backupId: string;
  outcomes: AutomationStudioFlowMigrationOutcome[];
  migrationNeeded: boolean;
};

export type AutomationStudioFlowMigrationInspectionPorts = {
  projects: AutomationStudioProjectStore;
  catalogue: AutomationStudioCatalogue;
  legacy: AutomationStudioLegacyRetirementStore;
};

/**
 * What migrating a project's legacy Flow sources would do, without doing it.
 * A legacy source whose provenance a canonical Flow already carries reads as
 * already migrated; the source itself is never touched.
 */
export async function inspectAutomationStudioFlowMigration(ports: AutomationStudioFlowMigrationInspectionPorts, projectId: string): Promise<AutomationStudioFlowMigrationInspection> {
  const project = await ports.projects.findProject(projectId);
  const [canonicalFlows, legacyArtifacts] = await Promise.all([
    ports.catalogue.listCanonicalFlowArtifacts(projectId),
    ports.legacy.readLegacyProjectArtifacts(projectId)
  ]);
  const catalog = resolveAutomationStudioFlowCatalog({
    projectId,
    scope: flowScopeForProject(project),
    canonicalFlows,
    legacyArtifacts
  });
  const alreadyMigrated = new Set(canonicalFlows.flatMap((flow) => flow.legacyProvenance
    ? [`${flow.legacyProvenance.kind}:${flow.legacyProvenance.artifactId}`]
    : []));
  const outcomes = catalog
    .filter((entry) => entry.source !== "canonical" && entry.flow.legacyProvenance)
    .map((entry) => {
      const provenance = entry.flow.legacyProvenance!;
      const key = `${provenance.kind}:${provenance.artifactId}`;
      const status: AutomationStudioFlowMigrationOutcome["status"] = alreadyMigrated.has(key) ? "already_migrated" : "created";
      return {
        legacyKind: provenance.kind,
        legacyArtifactId: provenance.artifactId,
        flowId: entry.flow.flowId,
        status,
        message: status === "already_migrated"
          ? "A canonical Flow already retains this legacy provenance."
          : "Legacy source will be retained unchanged as the recovery source."
      };
    });
  return {
    projectId,
    backupId: `legacy-source.${safeSegment(projectId)}`,
    outcomes,
    migrationNeeded: outcomes.some((outcome) => outcome.status === "created")
  };
}
