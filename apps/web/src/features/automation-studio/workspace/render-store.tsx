"use client";

import { memo, useSyncExternalStore, type ReactNode } from "react";
import type { AutomationWorkspacePrefs } from "./layout/contracts";
import { createScopedExternalStore, type ScopedExternalStore } from "../stores/external-store";
import { useUiRenderMetric } from "../../programs/ui-performance";

type AutomationWorkspaceRenderState = {
  prefs: AutomationWorkspacePrefs;
  saveStatus: string;
  saveRevision: number;
};

export type AutomationWorkspaceRenderStore = ScopedExternalStore<AutomationWorkspaceRenderState> & {
  getPrefs(): AutomationWorkspacePrefs;
  getSaveRevision(): number;
  getSaveStatus(): string;
  markSaveRequested(): boolean;
  replace(prefs: AutomationWorkspacePrefs): boolean;
  setSaveStatus(status: string): boolean;
};

export function createAutomationWorkspaceRenderStore(initialPrefs: AutomationWorkspacePrefs): AutomationWorkspaceRenderStore {
  const store = createScopedExternalStore<AutomationWorkspaceRenderState>({
    prefs: initialPrefs,
    saveStatus: "All workspace changes saved",
    saveRevision: 0
  });

  return {
    ...store,
    getPrefs: () => store.getState().prefs,
    getSaveRevision: () => store.getState().saveRevision,
    getSaveStatus: () => store.getState().saveStatus,
    markSaveRequested: () => store.update((current) => ({ ...current, saveRevision: current.saveRevision + 1 }), ["save-request"]),
    replace(nextPrefs) {
      const current = store.getState();
      if (nextPrefs === current.prefs) return false;
      Object.assign(current.prefs, nextPrefs);
      return store.replace({ ...current }, ["prefs"]);
    },
    setSaveStatus: (saveStatus) => store.update((current) => current.saveStatus === saveStatus ? current : { ...current, saveStatus }, ["save-status"])
  };
}

export const AutomationWorkspaceRenderBoundary = memo(function AutomationWorkspaceRenderBoundary(props: {
  render: (prefs: AutomationWorkspacePrefs) => ReactNode;
  renderInputs: readonly unknown[];
  store: AutomationWorkspaceRenderStore;
}) {
  useUiRenderMetric("AutomationStudioWorkspaceBoundary");
  useSyncExternalStore(
    (listener) => props.store.subscribe(listener, "prefs"),
    () => props.store.getRevision("prefs"),
    () => props.store.getRevision("prefs")
  );
  return props.render(props.store.getPrefs());
}, (previous, next) => previous.store === next.store
  && previous.render === next.render
  && shallowAutomationWorkspaceRenderInputsSame(previous.renderInputs, next.renderInputs));

export function shallowAutomationWorkspaceRenderInputsSame(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
