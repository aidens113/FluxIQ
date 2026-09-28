// The pane's preview tab, and what a tab is called when a guard has to name it.
//
// `openView(viewId, "preview")` used to append, so "preview" named a behaviour
// that did not exist: every click in the hierarchy tree left a permanent tab,
// and because Nodes, Settings and Adaptations are object-scoped that is one tab
// per Flow per view. Browsing five Flows left about fifteen tabs in a strip that
// shows three or four. A pane now holds at most one preview, and opening
// another replaces it -- the way a single-click preview behaves in an editor.
//
// **Nothing here is persisted.** A preview tab is a transient reading position,
// and restoring one into a saved layout would be restoring something the person
// never asked to keep. What persists is the tabs they did keep, which is exactly
// what did not survive before.

import type { AutomationWorkspacePane } from "../layout/contracts";
import { isDirtyAutomationView } from "../dirty-view-registry";
import { automationStudioViewBaseId, automationStudioViewDefinition } from "../../views";

export type AutomationPreviewTabRegistry = {
  /**
   * The pane's outgoing preview tab, if this activation may replace it, and
   * null if it may not. A dirty view is never the answer: work in progress is
   * kept and the tab is pinned instead of dropped.
   */
  replaceable(pane: AutomationWorkspacePane, viewId: string): string | null;
  /** This view is now the pane's preview. */
  preview(paneId: string, viewId: string): void;
  /** This view is kept for good: it is no longer the pane's preview. */
  pin(paneId: string, viewId: string): void;
  /** The tab is gone -- closed, or dragged somewhere the person meant to keep it. */
  forget(paneId: string, viewId: string): void;
};

export function createAutomationPreviewTabRegistry(): AutomationPreviewTabRegistry {
  const previewByPane = new Map<string, string>();
  return {
    replaceable(pane, viewId) {
      const previous = previewByPane.get(pane.id);
      if (!previous || previous === viewId || !pane.tabs.includes(previous)) return null;
      return isDirtyAutomationView(previous) ? null : previous;
    },
    preview(paneId, viewId) {
      previewByPane.set(paneId, viewId);
    },
    pin(paneId, viewId) {
      if (previewByPane.get(paneId) === viewId) previewByPane.delete(paneId);
    },
    forget(paneId, viewId) {
      if (previewByPane.get(paneId) === viewId) previewByPane.delete(paneId);
    }
  };
}

/**
 * What a guard says the person is about to close.
 *
 * It used to be the raw instance id, so an object-scoped view asked them to
 * decide about "closing flow-nodes::object::flow.checkout.subflow.primary.graph".
 * The label is whatever the view registry currently calls the view -- this
 * module reads names, it never defines them.
 */
export function automationClosingTabLabel(viewId: string): string {
  return `closing ${automationStudioViewDefinition(automationStudioViewBaseId(viewId))?.label ?? viewId}`;
}
