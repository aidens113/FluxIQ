"use client";

import { useEffect, useRef } from "react";
import type { AutomationSelection } from "../../shared/selection-contracts";
import { automationStudioDefaultViewForLink, automationStudioFlowScope, type AutomationStudioDeepLink } from "../../navigation";
import { automationStudioViewId } from "../../views";

type Options = {
  deepLink: AutomationStudioDeepLink;
  searchSignature: string;
  activeProjectId: string | null;
  loadedProjectId: string | null;
  activeViewId: string;
  projectFlowSignature: string;
  projectFlows: any[];
  selection: AutomationSelection | null;
  selectedFlow: any;
  lastOpenFlowId: string | null;
  flowById: ReadonlyMap<string, any>;
  loadFlow: (flowId: string) => Promise<any>;
  openSubflow: (flowId: string, subflowId: string, mode: "preview") => Promise<void>;
  selectFlow: (selection: AutomationSelection, mode: "preview") => boolean;
  openView: (viewId: string, mode: "preview") => void;
  /** Opens Suggested changes for the Flow with one adaptation selected (useAdaptationWorkspaceNavigation.openAdaptation). */
  openAdaptation: (flowId: string, adaptationId: string) => void;
};

/** The adaptation a link asks to show: only on a top-level Flow, and only in the adaptations view. */
function linkedAdaptationId(link: AutomationStudioDeepLink): string | null {
  if (!link.flowId || link.subflowId || link.detail?.kind !== "adaptation") return null;
  if (link.viewId && link.viewId !== automationStudioViewId.adaptations) return null;
  return link.detail.id;
}

export function useAutomationDeepLinkRuntime(options: Options): void {
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    const link = options.deepLink;
    if (!link.projectId || options.activeProjectId !== link.projectId || options.loadedProjectId !== options.activeProjectId) return;
    const adaptationId = linkedAdaptationId(link);
    const targetViewId = adaptationId ? automationStudioViewId.adaptations : automationStudioDefaultViewForLink(link);
    const key = [
      link.projectId,
      link.flowId ?? "",
      link.subflowId ?? "",
      targetViewId ?? "",
      link.detail ? link.detail.kind + ":" + link.detail.id : ""
    ].join("|");
    if (restoredRef.current === key) return;
    const currentFlowId = options.selection?.kind === "flow" ? options.selection.id : options.selectedFlow?.flowId ?? options.lastOpenFlowId;
    const currentScope = currentFlowId ? automationStudioFlowScope(currentFlowId, options.projectFlows) : null;
    const alreadyVisible = Boolean(
      (!targetViewId || targetViewId === options.activeViewId)
      && (!link.flowId || (currentScope?.flowId === link.flowId && (currentScope.subflowId ?? null) === (link.subflowId ?? null)))
    );
    if (alreadyVisible) {
      restoredRef.current = key;
      if (adaptationId) options.openAdaptation(link.flowId!, adaptationId);
      return;
    }
    if (link.flowId) {
      const parentFlow = options.flowById.get(link.flowId);
      if (!parentFlow || parentFlow.metadata?.subflowGraph === true) return;
    }
    restoredRef.current = key;
    void (async () => {
      if (link.flowId && link.subflowId) await options.openSubflow(link.flowId, link.subflowId, "preview");
      else if (link.flowId) {
        await options.loadFlow(link.flowId);
        options.selectFlow({ kind: "flow", id: link.flowId }, "preview");
      }
      if (adaptationId) options.openAdaptation(link.flowId!, adaptationId);
      else if (targetViewId) options.openView(targetViewId, "preview");
    })();
  }, [
    options.activeProjectId,
    options.activeViewId,
    options.deepLink,
    options.flowById,
    options.lastOpenFlowId,
    options.loadFlow,
    options.loadedProjectId,
    options.openAdaptation,
    options.openSubflow,
    options.openView,
    options.projectFlowSignature,
    options.projectFlows,
    options.searchSignature,
    options.selectFlow,
    options.selectedFlow?.flowId,
    options.selection
  ]);
}