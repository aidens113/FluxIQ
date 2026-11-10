"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import type { AutomationStudioFlowDocument } from "fluxiq/automation";
import type { ProgramCommandTransport } from "../../../../../../features/automation-studio/data/program-transport";
import {
  createBrowserAutomationFlowDraftRepository,
  loadAutomationFlowDetail,
  loadAutomationNodeDefinitions,
  saveAutomationFlowDraft,
  type AutomationFlowCommandOutcome,
  type AutomationFlowDraftRepository,
  type AutomationGraphSaveResult,
  type FlowEditorView
} from "../../../../../../features/automation-studio/flow-editor";

type EditorProps = ComponentProps<typeof FlowEditorView>;
type GraphDocument = Parameters<EditorProps["onSaveGraph"]>[0];

/** The graph page's read: still loading, could not be read (with the engine's words), or here. */
export type FlowGraphLoad =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; flow: AutomationStudioFlowDocument; definitions: unknown[] };

/**
 * One Flow's graph and the step types the canvas offers, read from the engine; saving sends the
 * canvas's changes as one graph patch and shows the saved Flow. A read that fails shows as failed,
 * never as an empty graph.
 */
export function useFlowGraph(studio: ProgramCommandTransport, projectId: string, flowId: string) {
  const [load, setLoad] = useState<FlowGraphLoad>({ state: "loading" });
  const [draft, setDraft] = useState<GraphDocument | null>(null);
  const [round, setRound] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  const drafts = useRef<AutomationFlowDraftRepository | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scope = { projectId, generation: round };
    const capabilities = { api: studio, isCurrent: () => !controller.signal.aborted };
    setLoad({ state: "loading" });
    setDraft(null);
    Promise.all([
      loadAutomationFlowDetail<AutomationStudioFlowDocument>({ scope, flowId, refresh: true, signal: controller.signal }, capabilities),
      loadAutomationNodeDefinitions<unknown>({ scope, signal: controller.signal }, capabilities)
    ]).then(([detail, definitions]) => {
      if (controller.signal.aborted) return;
      if (detail.status !== "success") {
        setLoad({ state: "error", message: `This Flow's steps could not be loaded: ${outcomeWords(detail)}` });
        return;
      }
      if (definitions.status !== "success") {
        setLoad({ state: "error", message: `The kinds of step the graph offers could not be loaded: ${outcomeWords(definitions)}` });
        return;
      }
      setLoad({ state: "ready", flow: detail.value.flow, definitions: [...definitions.value.native, ...definitions.value.published] });
    }, (error: unknown) => {
      /* best-effort: a read cancelled because the page moved on belongs to a graph no longer shown */
      if (controller.signal.aborted) return;
      setLoad({ state: "error", message: `This Flow's steps could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
    });
    return () => controller.abort();
  }, [studio, projectId, flowId, round]);

  const reload = useCallback(() => setRound((value) => value + 1), []);

  const save = useCallback(async (graph: GraphDocument, authorizationPin?: string): Promise<AutomationGraphSaveResult> => {
    const shown = latest.current;
    if (shown.state !== "ready") return { ok: false, state: "failed", message: "This Flow has not finished loading, so there is nothing to save yet." };
    drafts.current ??= createBrowserAutomationFlowDraftRepository();
    const outcome = await saveAutomationFlowDraft({
      scope: { projectId, generation: round },
      flow: shown.flow,
      graph,
      ...(authorizationPin ? { authorizationPin } : {}),
      canonical: true
    }, { api: studio, isCurrent: () => true, drafts: drafts.current });
    if (outcome.status === "success") {
      const { summaryOnly: _summaryOnly, ...metadata } = { ...(shown.flow.metadata ?? {}), ...(outcome.value.flow.metadata ?? {}) };
      setLoad({ state: "ready", flow: { ...outcome.value.flow, metadata }, definitions: shown.definitions });
      setDraft(null);
      return { ok: true, state: "saved", message: "Saved." };
    }
    if (outcome.status === "failure") {
      return { ok: false, state: outcome.code === "FLOW_SAVE_CONFLICT" ? "conflict" : "failed", message: outcome.error };
    }
    return { ok: false, state: "failed", message: `The save did not finish: ${outcome.reason}` };
  }, [studio, projectId, round]);

  return { load, reload, save, draft, setDraft };
}

function outcomeWords(outcome: Exclude<AutomationFlowCommandOutcome<unknown>, { status: "success" }>): string {
  return outcome.status === "failure" ? outcome.error : outcome.reason;
}
