"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyGlobalAlert } from "../../programs/shared-ui";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioViewId } from "../views/view-registry";
import type { AutomationGraphFocusRequest } from "../flow-editor/flow-editor-types";
import { automationPolicyGraphProblems } from "../flow-editor/graph-validation";
import { taskFlowToReactFlowGraph } from "../flow-editor/model/policy-graph";
import { automationGraphDraftIdentity, type AutomationGraphDraftRecord } from "../graph/draft-store";
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
};

export function useAutomationGraphRuntime(options: GraphRuntimeOptions) {
  const [recoverable, setRecoverable] = useState<AutomationGraphDraftRecord<GraphDocument> | null>(null);
  const [graphProblems, setGraphProblems] = useState<any[]>([]);
  const [focusRequest, setFocusRequest] = useState<AutomationGraphFocusRequest | null>(null);
  const persistenceRef = useRef<AutomationGraphDraftRecord<GraphDocument> | null>(null);
  const draftKey = automationGraphDraftIdentity(options.selectedTaskGraph);
  const draft = draftKey ? options.taskGraphDrafts[draftKey] ?? null : null;
  const subscribersActive = options.workspacePrefs.panes.some((pane) => pane.tabs.includes(automationStudioViewId.flowEditor) || pane.tabs.includes(automationStudioViewId.problems))
    || options.workspacePrefs.rightSidebar.tabs.includes(automationStudioViewId.problems);
  const baseGraph = useMemo(() => subscribersActive && options.selectedTaskGraph
    ? taskFlowToReactFlowGraph(options.selectedTaskGraph, "", options.availableNodeDefinitions)
    : null, [options.availableNodeDefinitions, options.selectedTaskGraph, subscribersActive]);

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

  const graphForValidation = draft ?? baseGraph;
  const visible = options.activeViewId === automationStudioViewId.problems || options.workspacePrefs.rightSidebar.activeViewId === automationStudioViewId.problems;
  useEffect(() => {
    if (!visible || !graphForValidation) {
      setGraphProblems((current) => current.length ? [] : current);
      return;
    }
    let cancelled = false;
    const flowId = options.selectedTaskGraph?.flowId ?? options.selectedTaskGraph?.id ?? "current-flow";
    const flowName = options.selectedTaskGraph?.name ?? "Current Flow";
    const cancel = scheduleAutomationGraphIdleTask(() => {
      const next = automationPolicyGraphProblems(graphForValidation.nodes, graphForValidation.edges).map((problem) => ({
        ...problem,
        id: "graph:" + problem.id,
        severity: "error",
        source: "graph",
        artifactId: flowId,
        artifactLabel: flowName
      }));
      if (!cancelled) setGraphProblems(next);
    }, { delayMs: 80, timeoutMs: 1_000 });
    return () => { cancelled = true; cancel(); };
  }, [graphForValidation, options.selectedTaskGraph?.flowId, options.selectedTaskGraph?.id, options.selectedTaskGraph?.name, visible]);

  const problems = useMemo(() => {
    const graphIds = new Set(graphProblems.map((problem) => problem.id));
    return [...graphProblems, ...options.snapshotProblems.map((problem: any, index: number) => ({
      ...problem,
      id: problem.id && !graphIds.has(String(problem.id)) ? String(problem.id) : "snapshot:" + (problem.id ?? index),
      severity: problem.severity ?? "error",
      source: problem.source ?? "project"
    }))];
  }, [graphProblems, options.snapshotProblems]);

  const clearDrafts = useCallback((flowId: string) => {
    options.setTaskGraphDrafts((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(flowId + ":"))
    ));
  }, [options.setTaskGraphDrafts]);
  const restoreDraft = useCallback(() => {
    const outcome = options.liveCommands.restoreFlowDraft(draftKey, recoverable);
    if (outcome.status !== "success") return;
    options.setTaskGraphDrafts((current) => ({ ...current, [outcome.value.draftKey]: outcome.value.graph }));
    setRecoverable(null);
    options.setDirty(true);
  }, [draftKey, options.liveCommands, options.setDirty, options.setTaskGraphDrafts, recoverable]);
  const discardDraft = useCallback(() => {
    if (!options.selectedTaskGraph?.flowId) return;
    void options.liveCommands.discardFlowDraft(options.selectedTaskGraph.flowId).then((outcome) => {
      if (outcome.status === "success") setRecoverable(null);
    });
  }, [options.liveCommands, options.selectedTaskGraph?.flowId]);
  const saveGraph = useCallback(async (graph: GraphDocument) => {
    if (!options.selectedFlow || options.selectedFlowEntry?.source !== "canonical") {
      return { ok: false, state: "failed" as const, message: "Only canonical Flows can be saved." };
    }
    const pin = window.prompt("Enter PIN to save this Flow") ?? "";
    const outcome = await options.liveCommands.saveFlowDraft(options.selectedFlow, graph, pin, true);
    if (outcome.status !== "success") {
      const message = outcome.status === "failure" ? outcome.error : "Flow save was cancelled.";
      options.setActionStatus(message);
      return { ok: false, state: outcome.status === "failure" && outcome.code === "FLOW_SAVE_CONFLICT" ? "conflict" as const : "failed" as const, message };
    }
    options.setProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: outcome.value.flow }]));
    clearDrafts(outcome.value.flowId);
    setRecoverable(null);
    options.setDirty(false);
    options.notifyChanged(["flow", "summary", "flow-metadata"], [outcome.value.flowId]);
    return { ok: true, state: "saved" as const, message: "Flow graph saved." };
  }, [clearDrafts, options]);
  const updateDraft = useCallback((graph: GraphDocument | null) => {
    if (!draftKey || !options.selectedTaskGraph?.flowId) return;
    options.setTaskGraphDrafts((current) => {
      if (!graph) {
        const { [draftKey]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [draftKey]: graph };
    });
    void options.liveCommands.updateFlowDraft({
      flowId: options.selectedTaskGraph.flowId,
      graph,
      baseGraph,
      baseRevision: String(options.selectedTaskGraph.graphRevision ?? options.selectedTaskGraph.revision ?? options.selectedTaskGraph.updatedAt ?? 0),
      baseUpdatedAt: options.selectedTaskGraph.updatedAt ?? 0
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
    restoreDraft,
    saveGraph,
    updateDraft
  };
}