import { automationStudioViewId } from "../views/view-registry";
import {
  automationEntityCollectionSelector,
  type AutomationProjectEntityKind,
  type AutomationStudioStores
} from "../stores";
import { createAutomationProjectViewModelSelector } from "../model/project-view-model";

export const EMPTY_AUTOMATION_RECORD = Object.freeze({}) as Record<string, never>;
export const EMPTY_AUTOMATION_LIST = Object.freeze([]) as unknown as any[];
export const EMPTY_AUTOMATION_PROJECT_ARTIFACTS = Object.freeze({
  tasks: EMPTY_AUTOMATION_LIST,
  routines: EMPTY_AUTOMATION_LIST,
  configs: EMPTY_AUTOMATION_LIST,
  flows: EMPTY_AUTOMATION_LIST
});
export const EMPTY_AUTOMATION_GATEWAY_SNAPSHOT = Object.freeze({
  enabled: false,
  sessions: EMPTY_AUTOMATION_LIST,
  pairings: EMPTY_AUTOMATION_LIST,
  auditLog: EMPTY_AUTOMATION_LIST
});

export function createAutomationSessionProjectViewReader(args: {
  activeProjectId: string | null;
  stores: AutomationStudioStores;
  workspace: { getPrefs(): { viewStates?: Record<string, Record<string, unknown> | undefined> } };
}) {
  const select = createAutomationProjectViewModelSelector();
  return () => {
    const currentData = args.stores.projectData.getState();
    const currentSelection = args.stores.selection.getState();
    const currentResources = currentData.resources;
    const resource = <Value,>(key: string, fallback: Value): Value => (
      currentResources.has(key) ? currentResources.get(key) as Value : fallback
    );
    const entities = (kind: AutomationProjectEntityKind) => (
      automationEntityCollectionSelector(kind)(currentData) as any[]
    );
    const prefs = args.workspace.getPrefs();
    const flowEditorState = prefs.viewStates?.[automationStudioViewId.flowEditor];
    return select({
      hasActiveProject: Boolean(args.activeProjectId),
      canonical: resource<any>("snapshot", null)?.payload?.canonical ?? EMPTY_AUTOMATION_RECORD,
      pipelineArtifacts: resource("pipelineArtifacts", EMPTY_AUTOMATION_RECORD),
      snapshotProblems: resource<any>("snapshot", null)?.payload?.problems ?? EMPTY_AUTOMATION_LIST,
      projectRecordings: entities("recordings"),
      projectTimelines: entities("timelines"),
      projectFlows: entities("flows"),
      projectArtifacts: resource("projectArtifacts", EMPTY_AUTOMATION_PROJECT_ARTIFACTS),
      indexedStateSources: resource("indexedStateSources", EMPTY_AUTOMATION_RECORD),
      nativeNodeDefinitions: resource("nativeNodeDefinitions", EMPTY_AUTOMATION_LIST),
      publishedFlowDefinitions: resource("publishedFlowDefinitions", EMPTY_AUTOMATION_LIST),
      customHierarchyNodes: resource("customHierarchyNodes", EMPTY_AUTOMATION_LIST),
      deletedHierarchyIds: resource("deletedHierarchyIds", EMPTY_AUTOMATION_LIST),
      selection: currentSelection.selection,
      lastOpenFlowId: typeof flowEditorState?.lastOpenFlowId === "string"
        ? flowEditorState.lastOpenFlowId
        : null,
      lastOpenTaskId: null
    });
  };
}
