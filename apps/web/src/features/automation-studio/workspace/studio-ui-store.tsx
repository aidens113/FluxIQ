"use client";

import { memo, useCallback, useSyncExternalStore, type ReactNode } from "react";
import type {
  AutomationCreatableHierarchyKind,
  AutomationHierarchyAction,
  AutomationHierarchyCategory,
  AutomationProjectModal,
  AutomationStudioProject,
  AutomationStudioProjectCategory
} from "../hierarchy/model";
import { createScopedExternalStore, type ScopedExternalStore } from "../stores/external-store";
import type { AutomationLayoutPickerState, AutomationWindowAdderState, AutomationWorkspacePrefs } from "./layout/contracts";
import type { AutomationWorkspaceRenderStore } from "./render-store";
import { useUiRenderMetric } from "../../programs/ui-performance";

export type AutomationHierarchyFlowOrigin =
  | "blank"
  | "deterministic"
  | "recorded"
  | "integration"
  | "scheduled"
  | "api-endpoint"
  | "reusable";

export type AutomationStudioUiState = {
  dataInspectorOpen: boolean;
  hierarchyAction: AutomationHierarchyAction;
  hierarchyCategory: AutomationHierarchyCategory;
  hierarchyCreateStep: "type" | "details";
  hierarchyFlowOrigin: AutomationHierarchyFlowOrigin;
  hierarchyKind: AutomationCreatableHierarchyKind;
  hierarchyName: string;
  hierarchyParentId: string | null;
  hierarchyPin: string;
  hierarchyStatus: string;
  layoutPickerOpen: AutomationLayoutPickerState | null;
  preferencesOpen: boolean;
  windowAdderOpen: AutomationWindowAdderState | null;
  isNarrowWorkspace: boolean;
  narrowWorkspacePanel: "hierarchy" | "inspector" | "timeline" | null;
  projectModal: AutomationProjectModal;
  projectTarget: AutomationStudioProject | null;
  categoryTarget: AutomationStudioProjectCategory | null;
  projectName: string;
  projectDescription: string;
  categoryName: string;
  projectPin: string;
  projectStatus: string;
  projectActionBusy: boolean;
  pendingProjectMove: { projectId: string; categoryId: string | null } | null;
  pendingCategoryMove: { categoryId: string; targetCategoryId: string } | null;
  dragOverCategoryId: string | null;
};

export type AutomationStudioUiStore = ScopedExternalStore<AutomationStudioUiState> & {
  patch(patch: Partial<AutomationStudioUiState>): boolean;
};

export function defaultAutomationStudioUiState(): AutomationStudioUiState {
  return {
    dataInspectorOpen: false,
    hierarchyAction: null,
    hierarchyCategory: "flow",
    hierarchyCreateStep: "type",
    hierarchyFlowOrigin: "blank",
    hierarchyKind: "flow",
    hierarchyName: "",
    hierarchyParentId: null,
    hierarchyPin: "",
    hierarchyStatus: "",
    layoutPickerOpen: null,
    preferencesOpen: false,
    windowAdderOpen: null,
    isNarrowWorkspace: false,
    narrowWorkspacePanel: null,
    projectModal: null,
    projectTarget: null,
    categoryTarget: null,
    projectName: "",
    projectDescription: "",
    categoryName: "",
    projectPin: "",
    projectStatus: "",
    projectActionBusy: false,
    pendingProjectMove: null,
    pendingCategoryMove: null,
    dragOverCategoryId: null
  };
}

export function createAutomationStudioUiStore(
  initialState: AutomationStudioUiState = defaultAutomationStudioUiState()
): AutomationStudioUiStore {
  const store = createScopedExternalStore(initialState);
  return {
    ...store,
    patch(patch) {
      const keys = Object.keys(patch) as Array<keyof AutomationStudioUiState>;
      if (!keys.some((key) => !Object.is(store.getState()[key], patch[key]))) return false;
      return store.update((current) => ({ ...current, ...patch }), studioUiScopes(keys));
    }
  };
}

function studioUiScopes(keys: readonly (keyof AutomationStudioUiState)[]): string[] {
  const scopes = new Set(keys.map(String));
  if (keys.some((key) => projectUiKeys.has(key))) scopes.add("project-ui");
  if (keys.some((key) => key === "isNarrowWorkspace" || key === "narrowWorkspacePanel")) scopes.add("narrow-workspace");
  if (keys.some((key) => String(key).startsWith("hierarchy"))) scopes.add("hierarchy");
  scopes.add("overlay");
  return [...scopes];
}

const projectUiKeys = new Set<keyof AutomationStudioUiState>([
  "projectModal", "projectTarget", "categoryTarget", "projectName", "projectDescription",
  "categoryName", "projectPin", "projectStatus", "projectActionBusy", "pendingProjectMove",
  "pendingCategoryMove", "dragOverCategoryId"
]);

export function useAutomationNarrowWorkspace(store: AutomationStudioUiStore) {
  useSyncExternalStore(
    (listener) => store.subscribe(listener, "narrow-workspace"),
    () => store.getRevision("narrow-workspace"),
    () => store.getRevision("narrow-workspace")
  );
  const state = store.getState();
  const setIsNarrowWorkspace = useCallback((isNarrowWorkspace: boolean) => {
    store.patch({ isNarrowWorkspace });
  }, [store]);
  const setNarrowWorkspacePanel = useCallback((
    next: AutomationStudioUiState["narrowWorkspacePanel"] |
      ((current: AutomationStudioUiState["narrowWorkspacePanel"]) => AutomationStudioUiState["narrowWorkspacePanel"])
  ) => {
    const current = store.getState().narrowWorkspacePanel;
    store.patch({ narrowWorkspacePanel: typeof next === "function" ? next(current) : next });
  }, [store]);
  return {
    isNarrowWorkspace: state.isNarrowWorkspace,
    narrowWorkspacePanel: state.narrowWorkspacePanel,
    setIsNarrowWorkspace,
    setNarrowWorkspacePanel
  };
}
export const AutomationStudioUiBoundary = memo(function AutomationStudioUiBoundary(props: {
  studioUiStore: AutomationStudioUiStore;
  render: (prefs: AutomationWorkspacePrefs, studioUi: AutomationStudioUiState) => ReactNode;
  renderInputs: readonly unknown[];
  workspaceStore: AutomationWorkspaceRenderStore;
}) {
  useUiRenderMetric("AutomationStudioOverlayBoundary");
  useSyncExternalStore(
    (listener) => props.studioUiStore.subscribe(listener, "overlay"),
    () => props.studioUiStore.getRevision("overlay"),
    () => props.studioUiStore.getRevision("overlay")
  );
  useSyncExternalStore(props.workspaceStore.subscribe, props.workspaceStore.getRevision, props.workspaceStore.getRevision);
  return props.render(props.workspaceStore.getPrefs(), props.studioUiStore.getState());
}, (previous, next) => previous.studioUiStore === next.studioUiStore
  && previous.workspaceStore === next.workspaceStore
  && previous.render === next.render
  && shallowStudioUiRenderInputsSame(previous.renderInputs, next.renderInputs));

export function shallowStudioUiRenderInputsSame(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
