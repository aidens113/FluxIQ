import { automationStudioViewId } from "../views/view-registry";
import { automationWorkspaceViewStateForBase } from "../workspace/view-state";
import {
  automationEntityCollectionSelector,
  type AutomationProjectDataState,
  type AutomationProjectEntityKind,
  type AutomationStudioStores
} from "../stores";
import type { AutomationSelectionState } from "../stores/selection-store";
import type { AutomationWorkspaceRenderStore } from "../workspace/render-store";
import {
  createAutomationProjectViewModelSelector,
  type AutomationProjectViewModel,
  type AutomationProjectViewModelInput
} from "./project-view-model";

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

export type AutomationProjectViewModelCache = {
  getRevisionKey(): string;
  read(): AutomationProjectViewModel;
};

/**
 * Owns the single whole-project derivation for one open project session.
 * Consumers share the result by store revision rather than running parallel
 * hierarchy/index/selection projections in each connected view.
 */
export function createAutomationProjectViewModelCache(args: {
  activeProjectId: string | null;
  stores: AutomationStudioStores;
  workspace: AutomationWorkspaceRenderStore;
}): AutomationProjectViewModelCache {
  const select = createAutomationProjectViewModelSelector();
  let previousRevisionKey = "";
  let previousModel: AutomationProjectViewModel | null = null;

  const getRevisionKey = () => [
    args.activeProjectId ?? "no-project",
    args.stores.projectData.getRevision(),
    args.stores.selection.getRevision(),
    args.workspace.getRevision("prefs")
  ].join(":");

  return {
    getRevisionKey,
    read() {
      const revisionKey = getRevisionKey();
      if (previousModel && revisionKey === previousRevisionKey) return previousModel;
      previousRevisionKey = revisionKey;
      previousModel = select(automationProjectViewModelInput({
        activeProjectId: args.activeProjectId,
        projectData: args.stores.projectData.getState(),
        selection: args.stores.selection.getState(),
        workspace: args.workspace
      }));
      return previousModel;
    }
  };
}

export function automationProjectViewModelInput(args: {
  activeProjectId: string | null;
  projectData: AutomationProjectDataState;
  selection: AutomationSelectionState;
  workspace: Pick<AutomationWorkspaceRenderStore, "getPrefs">;
}): AutomationProjectViewModelInput {
  const resources = args.projectData.resources;
  const resource = <Value,>(key: string, fallback: Value): Value => (
    resources.has(key) ? resources.get(key) as Value : fallback
  );
  const entities = (kind: AutomationProjectEntityKind) => (
    automationEntityCollectionSelector(kind)(args.projectData) as any[]
  );
  const workspacePrefs = args.workspace.getPrefs();
  const flowEditorState = automationWorkspaceViewStateForBase(workspacePrefs, automationStudioViewId.flowEditor);
  return {
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
    selection: args.selection.selection,
    lastOpenFlowId: typeof flowEditorState?.lastOpenFlowId === "string"
      ? flowEditorState.lastOpenFlowId
      : null,
    lastOpenTaskId: null
  };
}
