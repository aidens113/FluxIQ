"use client";

import { memo, useSyncExternalStore, type ReactNode } from "react";
import type { AutomationWorkspacePrefs } from "./layout";

export type AutomationWorkspaceRenderStore = {
  getPrefs(): AutomationWorkspacePrefs;
  getRevision(): number;
  replace(prefs: AutomationWorkspacePrefs): void;
  subscribe(listener: () => void): () => void;
};

export function createAutomationWorkspaceRenderStore(initialPrefs: AutomationWorkspacePrefs): AutomationWorkspaceRenderStore {
  let prefs = initialPrefs;
  let revision = 0;
  const listeners = new Set<() => void>();
  const invalidate = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  return {
    getPrefs: () => prefs,
    getRevision: () => revision,
    replace(nextPrefs) {
      if (nextPrefs === prefs) return;
      Object.assign(prefs, nextPrefs);
      invalidate();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export const AutomationWorkspaceRenderBoundary = memo(function AutomationWorkspaceRenderBoundary(props: {
  render: (prefs: AutomationWorkspacePrefs) => ReactNode;
  renderInputs: readonly unknown[];
  store: AutomationWorkspaceRenderStore;
}) {
  useSyncExternalStore(props.store.subscribe, props.store.getRevision, props.store.getRevision);
  return props.render(props.store.getPrefs());
}, (previous, next) => previous.store === next.store
  && previous.render === next.render
  && shallowAutomationWorkspaceRenderInputsSame(previous.renderInputs, next.renderInputs));

export function shallowAutomationWorkspaceRenderInputsSame(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
