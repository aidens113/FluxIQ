"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyGlobalAlert } from "../../programs/shared-ui";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioViewBaseId, automationStudioViewId } from "../views/view-registry";
import type { AutomationGraphFocusRequest } from "../flow-editor/flow-editor-types";
import {
  automationGraphDerivationKeys,
  createAutomationGraphDerivationJob
} from "../graph/derivation-job";
import { automationGraphDraftIdentity, type AutomationGraphDraftRecord } from "../graph/draft-store";
import { applyAutomationGraphDraftRestore, discardAutomationGraphRecovery, reloadSavedAutomationGraph, shouldRestoreAutomationGraphDraft } from "../graph/recovery-actions";
import { scheduleAutomationGraphIdleTask } from "../graph/worker-tasks";
import { mergeFlowDetails } from "../model/project-change-reconciliation";
import type { AutomationLiveDomainCommands } from "./domain-commands";

type GraphDocument = { nodes: any[]; edges: any[] };
type GraphRuntimeOptions = {
  activeProjectId: string | null;
  activeViewId: string;
  workspacePrefs: AutomationWorkspacePrefs;
  selectedTaskGraph: any;
  selectedFlow: any;
  selectedFlowEntry: any;
  availableNodeDefinitions: any[];
  snapshotProblems: any[];
  taskGraphDrafts: Record<string, GraphDocument>;
  liveCommands: AutomationLiveDomainCommands;
  setTaskGraphDrafts: (next: Record<string, GraphDocument> | ((current: Record<string, GraphDocument>) => Record<string, GraphDocument>)) => void;
  setProjectFlows: (next: any[] | ((current: any[]) => any[])) => void;
  setDirty: (dirty: boolean) => void;
  setActionStatus: (status: string) => void;
  notifyChanged: (scopes: any[], resourceIds: string[]) => void;
  reloadFlowDetail(flowId: string): Promise<unknown | null>;
  getSnapshot?: () => Pick<
    GraphRuntimeOptions,
    "activeProjectId" | "selectedTaskGraph" | "selectedFlow" | "selectedFlowEntry"
      | "availableNodeDefinitions" | "snapshotProblems" | "taskGraphDrafts"
  >;
};

export function useAutomationGraphRuntime(options: GraphRuntimeOptions) {
  const [recoverable, setRecoverable] = useState<AutomationGraphDraftRecord<GraphDocument> | null>(null);
  const [focusRequest, setFocusRequest] = useState<AutomationGraphFocusRequest | null>(null);
  const persistenceRef = useRef<AutomationGraphDraftRecord<GraphDocument> | null>(null);
  const derivationJobRef = useRef<ReturnType<typeof createAutomationGraphDerivationJob> | null>(null);
  if (!derivationJobRef.current) derivationJobRef.current = createAutomationGraphDerivationJob();
  const derivationJob = derivationJobRef.current;
  const [derivationSnapshot, setDerivationSnapshot] = useState(() => derivationJob.getSnapshot());
  const draftKey = automationGraphDraftIdentity(options.selectedTaskGraph);
  const draft = draftKey ? options.taskGraphDrafts[draftKey] ?? null : null;
  const graphVisible = options.workspacePrefs.panes.some((pane) => automationStudioViewBaseId(pane.activeViewId) === automationStudioViewId.flowEditor);
  const problemsVisible = options.workspacePrefs.panes.some((pane) => pane.activeViewId === automationStudioViewId.problems)
    || (!options.workspacePrefs.rightSidebar.collapsed
      && !options.workspacePrefs.rightSidebarCollapsed
      && options.workspacePrefs.rightSidebar.activeViewId === automationStudioViewId.problems);
  const subscribersActive = graphVisible || problemsVisible;
  const baseGraph = derivationSnapshot.graph;

  useEffect(() => {
    if (!subscribersActive) return;
    const unsubscribe = derivationJob.subscribe(setDerivationSnapshot);
    if (!options.selectedTaskGraph) {
      derivationJob.setRequest(null);
      return unsubscribe;
    }
    const { ownerKey, revisionKey } = automationGraphDerivationKeys({
      projectId: options.activeProjectId,
      source: options.selectedTaskGraph,
      nodeDefinitions: options.availableNodeDefinitions,
      validationGraph: draft,
      validate: problemsVisible
    });
    derivationJob.setRequest({
      ownerKey,
      revisionKey,
      flowId: String(options.selectedTaskGraph.flowId ?? options.selectedTaskGraph.id ?? "current-flow"),
      flowName: String(options.selectedTaskGraph.name ?? "Current Flow"),
      source: options.selectedTaskGraph,
      nodeDefinitions: options.availableNodeDefinitions,
      validationGraph: draft,
      validate: problemsVisible
    });
    return unsubscribe;
  }, [
    derivationJob,
    draft,
    options.activeProjectId,
    options.availableNodeDefinitions,
    options.selectedTaskGraph,
    problemsVisible,
    subscribersActive
  ]);

  useEffect(() => {
    if (!options.activeProjectId || !options.selectedTaskGraph?.flowId || draft) {
      setRecoverable(null);
      return;
    }
    let cancelled = false;
    const flowId = options.selectedTaskGraph.flowId;
    const cancel = scheduleAutomationGraphIdleTask(() => {
      void options.liveCommands.loadRecoverableFlowDraft(flowId, baseGraph).then((candidate) => {
        if (!cancelled) setRecoverable(candidate);
      });
    }, { delayMs: 120, timeoutMs: 1_500 });
    return () => { cancelled = true; cancel(); };
  }, [options.activeProjectId, options.selectedTaskGraph?.flowId, options.selectedTaskGraph?.updatedAt, draft, baseGraph, options.liveCommands]);

  useEffect(() => {
    if (!options.activeProjectId || !options.selectedTaskGraph?.flowId || !draft) {
      persistenceRef.current = null;
      return;
    }
    persistenceRef.current = {
      projectId: options.activeProjectId,
      flowId: options.selectedTaskGraph.flowId,
      baseUpdatedAt: options.selectedTaskGraph.updatedAt ?? 0,
      savedAt: Date.now(),
      graph: draft
    };
  }, [draft, options.activeProjectId, options.selectedTaskGraph?.flowId, options.selectedTaskGraph?.updatedAt]);

  useEffect(() => {
    const projectId = options.activeProjectId;
    const flowId = options.selectedTaskGraph?.flowId;
    return () => {
      const pending = persistenceRef.current;
      if (projectId && flowId && pending?.projectId === projectId && pending.flowId === flowId) {
        options.liveCommands.persistFlowDraft(flowId, pending.baseUpdatedAt, pending.graph, Date.now());
      }
    };
  }, [options.activeProjectId, options.liveCommands, options.selectedTaskGraph?.flowId]);

  useEffect(() => {
    if (!options.activeProjectId || !options.selectedTaskGraph?.flowId || !draft) return;
    const timeout = window.setTimeout(() => {
      const outcome = options.liveCommands.persistFlowDraft(
        options.selectedTaskGraph.flowId,
        options.selectedTaskGraph.updatedAt ?? 0,
        draft,
        Date.now()
      );
      if (outcome.status === "failure") notifyGlobalAlert({
        tone: "error", title: "Draft recovery unavailable", message: outcome.error, id: "automation-draft-store-failed"
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [draft, options.activeProjectId, options.liveCommands, options.selectedTaskGraph?.flowId, options.selectedTaskGraph?.updatedAt]);

  const problems = useMemo(() => {
    const graphIds = new Set(derivationSnapshot.problems.map((problem) => problem.id));
    return [...derivationSnapshot.problems, ...options.snapshotProblems.map((problem: any, index: number) => ({
      ...problem,
      id: problem.id && !graphIds.has(String(problem.id)) ? String(problem.id) : "snapshot:" + (problem.id ?? index),
      severity: problem.severity ?? "error",
      source: problem.source ?? "project"
    }))];
  }, [derivationSnapshot.problems, options.snapshotProblems]);

  const clearDrafts = useCallback((flowId: string) => {
    options.setTaskGraphDrafts((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(flowId + ":"))
    ));
  }, [options.setTaskGraphDrafts]);
  const restoreDraft = useCallback(() => {
    if (!shouldRestoreAutomationGraphDraft(recoverable?.baseUpdatedAt !== (options.selectedTaskGraph?.updatedAt ?? 0), () => window.confirm("This draft began from an older Flow revision. Restore it for review without overwriting the saved Flow?"))) return;
    const outcome = options.liveCommands.restoreFlowDraft(draftKey, recoverable);
    const restored = applyAutomationGraphDraftRestore(outcome as any, (value: any) => {
      options.setTaskGraphDrafts((current) => ({ ...current, [value.draftKey]: value.graph }));
      setRecoverable(null);
      options.setDirty(true);
    });
    if (!restored.ok) notifyGlobalAlert({ tone: "error", title: "Draft could not be restored", message: restored.error, id: "automation-draft-restore-failed" });
  }, [draftKey, options.liveCommands, options.setDirty, options.setTaskGraphDrafts, recoverable]);
  const discardDraft = useCallback(() => {
    const current = options.getSnapshot?.() ?? options;
    if (!current.selectedTaskGraph?.flowId) return;
    void discardAutomationGraphRecovery(() => options.liveCommands.discardFlowDraft(current.selectedTaskGraph.flowId) as any, () => setRecoverable(null)).then((outcome) => {
      if (!outcome.ok) notifyGlobalAlert({ tone: "error", title: "Draft could not be discarded", message: outcome.error, id: "automation-draft-discard-failed" });
    });
  }, [options.liveCommands, options.selectedTaskGraph?.flowId]);
  const reloadGraph = useCallback(() => {
    const current = options.getSnapshot?.() ?? options;
    const flowId = current.selectedTaskGraph?.flowId;
    if (!flowId) return;
    void reloadSavedAutomationGraph({ reload: () => options.reloadFlowDetail(flowId), clearDraft: () => clearDrafts(flowId), markClean: () => options.setDirty(false), notify: () => options.notifyChanged(["flow", "summary", "flow-metadata"], [flowId]) }).then((outcome) => {
      if (!outcome.ok) notifyGlobalAlert({ tone: "error", title: "Flow could not be reloaded", message: outcome.error, id: "automation-graph-reload-failed" });
    });
  }, [clearDrafts, options]);
  const saveGraph = useCallback(async (graph: GraphDocument, authorizationPin?: string) => {
    const current = options.getSnapshot?.() ?? options;
    if (!current.selectedFlow || current.selectedFlowEntry?.source !== "canonical") {
      return { ok: false, state: "failed" as const, message: "Only canonical Flows can be saved." };
    }
    const pin = authorizationPin?.trim() ?? "";
    if (pin.length < 4) {
      const message = "Enter your security PIN in the Save Project modal.";
      options.setActionStatus(message);
      return { ok: false, state: "failed" as const, message };
    }
    const outcome = await options.liveCommands.saveFlowDraft(current.selectedFlow, graph, pin, true);
    if (outcome.status !== "success") {
      const message = outcome.status === "failure" ? outcome.error : "Flow save was cancelled.";
      options.setActionStatus(message);
      return { ok: false, state: outcome.status === "failure" && outcome.code === "FLOW_SAVE_CONFLICT" ? "conflict" as const : "failed" as const, message };
    }
    const mergedMetadata = { ...(current.selectedFlow.metadata ?? {}), ...(outcome.value.flow.metadata ?? {}) };
    const { summaryOnly: _summaryOnly, ...savedMetadata } = mergedMetadata;
    const savedFlow = {
      ...outcome.value.flow,
      metadata: savedMetadata
    };
    options.setProjectFlows((projectFlows) => mergeFlowDetails(projectFlows, [{ source: "canonical", readOnly: false, flow: savedFlow }]));
    clearDrafts(outcome.value.flowId);
    setRecoverable(null);
    options.setDirty(false);
    options.notifyChanged(["flow", "summary", "flow-metadata"], [outcome.value.flowId]);
    return { ok: true, state: "saved" as const, message: "Flow graph saved." };
  }, [clearDrafts, options]);
  const updateDraft = useCallback((graph: GraphDocument | null) => {
    const current = options.getSnapshot?.() ?? options;
    const currentDraftKey = automationGraphDraftIdentity(current.selectedTaskGraph);
    if (!currentDraftKey || !current.selectedTaskGraph?.flowId) return;
    options.setTaskGraphDrafts((current) => {
      if (!graph) {
        const { [currentDraftKey]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [currentDraftKey]: graph };
    });
    void options.liveCommands.updateFlowDraft({
      flowId: current.selectedTaskGraph.flowId,
      graph,
      baseGraph,
      baseRevision: String(current.selectedTaskGraph.graphRevision ?? current.selectedTaskGraph.revision ?? current.selectedTaskGraph.updatedAt ?? 0),
      baseUpdatedAt: current.selectedTaskGraph.updatedAt ?? 0
    });
  }, [baseGraph, draftKey, options.liveCommands, options.selectedTaskGraph, options.setTaskGraphDrafts]);
  const focusProblem = useCallback((problem: any) => {
    setFocusRequest((current) => ({ revision: (current?.revision ?? 0) + 1, problem }));
  }, []);
  const reset = useCallback(() => setRecoverable(null), []);
  const recoverableDraft = useMemo(() => recoverable ? {
    savedAt: recoverable.savedAt,
    stale: recoverable.baseUpdatedAt !== (options.selectedTaskGraph?.updatedAt ?? 0)
  } : null, [options.selectedTaskGraph?.updatedAt, recoverable]);

  return {
    baseGraph,
    clearDrafts,
    discardDraft,
    draft,
    focusProblem,
    focusRequest,
    problems,
    recoverableDraft,
    reset,
    reloadGraph,
    restoreDraft,
    saveGraph,
    updateDraft
  };
}
