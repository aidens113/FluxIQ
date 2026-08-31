import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import { createAutomationProjectCatalogStore } from "./project-catalog-store";
import { createAutomationProjectDataStore } from "./project-data-store";
import { createAutomationProjectQueryStore } from "./project-query-store";
import { createAutomationRuntimeStatusStore } from "./runtime-status-store";
import { createAutomationSelectionStore } from "./selection-store";

export function createAutomationStudioStores() {
  const catalog = createAutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>();
  const projectData = createAutomationProjectDataStore();
  const queries = createAutomationProjectQueryStore();
  const selection = createAutomationSelectionStore();
  const runtimeStatus = createAutomationRuntimeStatusStore();
  projectData.transaction(() => {
    projectData.setResource("snapshot", null);
    projectData.setResource("projectArtifacts", { tasks: [], routines: [], configs: [], flows: [] });
    projectData.setResource("nativeNodeDefinitions", []);
    projectData.setResource("publishedFlowDefinitions", []);
    projectData.setResource("flowPublications", []);
    projectData.setResource("flowDependencyInfo", { dependencies: [], usedBy: [], availableUpgrades: [] });
    projectData.setResource("hasDirtyTaskGraph", false);
    projectData.setResource("taskGraphDrafts", {});
    projectData.setResource("recordingDomains", []);
    projectData.setResource("pipelineArtifacts", {
      normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [],
      stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: []
    });
    projectData.setResource("gatewaySnapshot", { enabled: false, sessions: [], pairings: [], auditLog: [] });
    projectData.setResource("indexedStateSources", {});
    projectData.setResource("loadedProjectHierarchyId", null);
    projectData.setResource("projectSearch", "");
    projectData.setResource("projectTypeFilter", "all");
    projectData.setResource("customHierarchyNodes", []);
    projectData.setResource("deletedHierarchyIds", []);
  });
  const stores = { catalog, projectData, queries, selection, runtimeStatus };

  return {
    ...stores,
    transaction<Result>(operation: () => Result): Result {
      return catalog.transaction(() =>
        projectData.transaction(() =>
          queries.transaction(() =>
            selection.transaction(() => runtimeStatus.transaction(operation))
          )
        )
      );
    }
  };
}

export type AutomationStudioStores = ReturnType<typeof createAutomationStudioStores>;
