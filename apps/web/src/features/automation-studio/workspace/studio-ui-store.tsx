"use client";

import { memo, useSyncExternalStore, type ReactNode } from "react";
import type {
  AutomationCreatableHierarchyKind,
  AutomationHierarchyAction,
  AutomationHierarchyCategory
} from "../hierarchy/model";
import type { AutomationLayoutPickerState, AutomationWindowAdderState, AutomationWorkspacePrefs } from "./layout";
import type { AutomationWorkspaceRenderStore } from "./render-store";

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
};

export type AutomationStudioUiStore = {
  getRevision(): number;
  getState(): AutomationStudioUiState;
  patch(patch: Partial<AutomationStudioUiState>): void;
  replace(state: AutomationStudioUiState): void;
  subscribe(listener: () => void): () => void;
  update(updater: (current: AutomationStudioUiState) => AutomationStudioUiState): void;
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
    windowAdderOpen: null
  };
}

export function createAutomationStudioUiStore(
  initialState: AutomationStudioUiState = defaultAutomationStudioUiState()
): AutomationStudioUiStore {
  let state = initialState;
  let revision = 0;
  const listeners = new Set<() => void>();

  const publish = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  const replace = (next: AutomationStudioUiState) => {
    if (next === state || shallowStudioUiStateSame(state, next)) return;
    state = next;
    publish();
  };

  return {
    getRevision: () => revision,
    getState: () => state,
    patch(patch) {
      replace({ ...state, ...patch });
    },
    replace,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(updater) {
      replace(updater(state));
    }
  };
}

export const AutomationStudioUiBoundary = memo(function AutomationStudioUiBoundary(props: {
  studioUiStore: AutomationStudioUiStore;
  render: (prefs: AutomationWorkspacePrefs, studioUi: AutomationStudioUiState) => ReactNode;
  renderInputs: readonly unknown[];
  workspaceStore: AutomationWorkspaceRenderStore;
}) {
  useSyncExternalStore(props.studioUiStore.subscribe, props.studioUiStore.getRevision, props.studioUiStore.getRevision);
  useSyncExternalStore(props.workspaceStore.subscribe, props.workspaceStore.getRevision, props.workspaceStore.getRevision);
  return props.render(props.workspaceStore.getPrefs(), props.studioUiStore.getState());
}, (previous, next) => previous.studioUiStore === next.studioUiStore
  && previous.workspaceStore === next.workspaceStore
  && previous.render === next.render
  && shallowStudioUiRenderInputsSame(previous.renderInputs, next.renderInputs));

export function shallowStudioUiRenderInputsSame(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function shallowStudioUiStateSame(left: AutomationStudioUiState, right: AutomationStudioUiState): boolean {
  const keys = Object.keys(left) as Array<keyof AutomationStudioUiState>;
  return keys.every((key) => Object.is(left[key], right[key]));
}
