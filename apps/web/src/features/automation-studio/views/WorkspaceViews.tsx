"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useState } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { AutomationDockTab, AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";
import { groupByNamespace } from "./view-utils";
import { graphToTaskFlow } from "../model/project-artifacts";
import { AutomationPolicyCanvas } from "./GraphEditorViews";
export function AutomationRecordingWorkspace(props: { recordings: any[]; selectedRecording: any; selectedTimeline: any; setSelection(selection: AutomationSelection): void }) {
  const entries = props.selectedTimeline?.timeline ?? props.selectedRecording?.timeline ?? [];
  const checkpoints = entries.filter((entry: any) => entry.type === "state_checkpoint").length;
  const deltas = entries.filter((entry: any) => entry.type === "state_delta").reduce((total: number, entry: any) => total + (entry.deltas?.length ?? 0), 0);
  return (
    <section className="automation-recording-stage">
      <header><strong>{props.selectedRecording?.recordingId ?? "No recording"}</strong><span>{entries.length} entries | {checkpoints} checkpoints | {deltas} deltas</span></header>
      <div className="context-chip-row">
        <span>Environment {props.selectedRecording?.environment?.label ?? "-"}</span>
        <span>Notes {props.selectedRecording?.notes?.length ?? 0}</span>
        <span>Started {props.selectedRecording?.startedAt ? new Date(props.selectedRecording.startedAt).toLocaleTimeString() : "-"}</span>
      </div>
      <div className="automation-state-list">
        {props.recordings.map((recording) => (
          <button className={recording.recordingId === props.selectedRecording?.recordingId ? "selected" : ""} key={recording.recordingId} onClick={() => props.setSelection({ kind: "recording", id: recording.recordingId })} type="button">
            <strong>{recording.recordingId}</strong>
            <span>{recording.environment?.label ?? "Environment"} | {recording.timeline?.length ?? 0} raw entries</span>
          </button>
        ))}
      </div>
      <div className="automation-track-stack">
        {["note", "action", "state_delta", "state_checkpoint"].map((type) => (
          <div className="automation-track" key={type}>
            <strong>{type.replace("_", " ")}</strong>
            <div>
              {entries.filter((entry: any) => entry.type === type).map((entry: any) => (
                <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} style={{ left: `${Math.min(92, Math.max(0, (entry.monotonicOffsetMs ?? 0) / 18))}%` }} type="button">
                  <span>{timelineEntrySummary(entry)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AutomationSignalWorkspace(props: { domains: any[]; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const namespaces = groupByNamespace(props.signals);
  return (
    <section className="automation-signal-board">
      <div className="automation-domain-contracts">
        <header><strong>Recording Domains</strong><span>{props.domains.length} registered</span></header>
        {props.domains.map((domain) => (
          <article key={domain.domainId}>
            <strong>{domain.label ?? domain.domainId}</strong>
            <span>{domain.domainId}</span>
            <small>{domain.eventTypes?.length ?? 0} event types | {domain.stateReducers?.length ?? 0} reducers | {domain.observationExtractors?.length ?? 0} extractors</small>
          </article>
        ))}
        {!props.domains.length ? <span>No recording domain contracts are registered by the host repo yet.</span> : null}
      </div>
      {Object.entries(namespaces).map(([namespace, namespaceSignals]) => (
        <div className="automation-state-namespace" key={namespace}>
          <strong>{namespace}</strong>
          {namespaceSignals.map((signal) => (
            <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
              <span>{signal.registryId}</span>
              <strong>{signal.path}</strong>
              <small>{signal.type} | {signal.comparator?.kind ?? "exact"} | {signal.volatility}</small>
            </button>
          ))}
        </div>
      ))}
      {!props.signals.length ? <span>No signal registries loaded.</span> : null}
    </section>
  );
}

export function AutomationRuntimeWorkspace(props: { projectId: string | null; pipelineArtifacts: any; timelines: any[]; models: any[]; policies: any[]; runtimeSessions: any[] }) {
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  return (
    <section className="automation-runtime-stage">
      <SummaryStrip items={[
        ["Runs", props.runtimeSessions.length],
        ["Timelines", props.timelines.length],
        ["Models", props.models.length],
        ["Proposals", props.pipelineArtifacts?.policyProposals?.length ?? 0],
        ["Runnable Nodes", props.policies.reduce((total, policy) => total + (policy.nodes?.length ?? 0), 0)]
      ]} />
      <RuntimeDebugInnerView projectId={props.projectId} initialSessions={orderedSessions} />
    </section>
  );
}


export function AutomationRunsWorkspace(props: { projectId: string | null; pipelineArtifacts: any; runtimeSessions: any[] }) {
  const replays = props.pipelineArtifacts?.replayResults ?? [];
  const orderedSessions = useMemo(() => sortRuntimeRunsForDebugView(props.runtimeSessions), [props.runtimeSessions]);
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Runs</strong><span>Replay and runtime validation history</span></div>
      </header>
      <SummaryStrip items={[["Runtime Runs", props.runtimeSessions.length], ["Replay Runs", replays.length], ["Failures", props.runtimeSessions.filter((session) => session.status === "failed").length + replays.filter((replay: any) => replay.status === "failed").length], ["Validated", replays.filter((replay: any) => replay.status === "matched").length]]} />
      <RuntimeDebugInnerView projectId={props.projectId} initialSessions={orderedSessions} />
      <DataTable columns={["Replay", "Status", "Recording", "Proposal", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
        replay.replayId,
        <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />,
        replay.recordingId,
        replay.policyId,
        `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`,
        replay.timingWarnings?.length ?? 0
      ])} empty="No replay validations generated yet." />
    </section>
  );
}

const SUBFLOW_PAGE_SIZE = 25;

export function AutomationSubflowsWorkspace(props: { projectId: string | null; flow: any; nativeNodeDefinitions: any[]; recordings: any[]; selectedNode: any; selectedTimeline: any; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId ?? "";
  const [subflows, setSubflows] = useState<any[]>([]);
  const [selectedSubflow, setSelectedSubflow] = useState<any | null>(null);
  const [selectedGraph, setSelectedGraph] = useState<any | null>(null);
  const [selectedGraphDraft, setSelectedGraphDraft] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [graphDirty, setGraphDirty] = useState(false);
  const [router, setRouter] = useState<any | null>(null);
  const [page, setPage] = useState({ limit: SUBFLOW_PAGE_SIZE, offset: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setSelectedSubflow(null);
    setSelectedGraph(null);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    setRouter(null);
    if (!props.projectId || !flowId) return;
    void loadSubflows(0);
    void loadRouter();
  }, [props.projectId, flowId]);
  const loadRouter = async () => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId });
    if (result.ok) setRouter(result.payload?.router ?? null);
  };
  const loadSubflows = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    const result = await api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-subflows", { projectId: props.projectId, flowId, limit: SUBFLOW_PAGE_SIZE, offset });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Subflows could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setSubflows(result.payload?.subflows ?? resultPage?.subflows ?? []);
    setPage({ limit: resultPage?.limit ?? SUBFLOW_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.subflows?.length ?? 0 });
  };
  const openSubflow = async (subflowId: string) => {
    if (!props.projectId || !flowId) return;
    setError("");
    const result = await api.post<{ subflow?: any }>("get-flow-subflow", { projectId: props.projectId, flowId, subflowId });
    if (!result.ok || !result.payload?.subflow) {
      setError(result.error ?? "Subflow detail could not be loaded.");
      return;
    }
    setSelectedSubflow(result.payload.subflow);
    await loadSubflowGraph(result.payload.subflow.graphFlowId ?? flowId);
  };
  const loadSubflowGraph = async (graphFlowId: string) => {
    if (!props.projectId || !graphFlowId) return;
    setLoadingGraph(true);
    setSelectedGraph(null);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    const result = await api.post<{ flow?: any }>("get-flow", { projectId: props.projectId, flowId: graphFlowId });
    setLoadingGraph(false);
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Subflow graph could not be loaded.");
      return;
    }
    setSelectedGraph(result.payload.flow);
  };
  const mutateSubflow = async (endpoint: string, payload: Record<string, unknown>) => {
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    const result = await api.post<{ subflow?: any }>(endpoint, { ...payload, authorizationPin });
    if (!result.ok) {
      setError(result.error ?? "Subflow change failed.");
      return;
    }
    if (result.payload?.subflow) setSelectedSubflow(result.payload.subflow);
    await loadSubflows(page.offset);
  };
  const createSubflow = async () => {
    if (!props.projectId || !flowId) return;
    const name = window.prompt("Subflow name");
    if (!name?.trim()) return;
    await mutateSubflow("create-flow-subflow", { projectId: props.projectId, flowId, name: name.trim(), role: "utility" });
  };
  const renameSubflow = async () => {
    if (!props.projectId || !flowId || !selectedSubflow?.subflowId) return;
    const name = window.prompt("Subflow name", selectedSubflow.name ?? "");
    if (!name?.trim()) return;
    await mutateSubflow("rename-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow.subflowId, name: name.trim() });
  };
  const saveSelectedSubflowGraph = async (graph: { nodes: any[]; edges: any[] }) => {
    if (!props.projectId || !selectedGraph) return false;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return false;
    const serializedGraph = graphToTaskFlow({
      task: { taskId: selectedGraph.flowId, name: selectedGraph.name } as any,
      existingFlow: { ...selectedGraph, ownerKind: "flow", ownerId: selectedGraph.flowId } as any,
      graph
    });
    const { regions: _regions, regionHandoffs: _regionHandoffs, ...flowWithoutEditorRegions } = selectedGraph;
    const result = await api.post<{ flow?: any }>("save-flow", {
      projectId: props.projectId,
      authorizationPin,
      flow: { ...flowWithoutEditorRegions, nodes: serializedGraph.nodes, edges: serializedGraph.edges }
    });
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Subflow graph could not be saved.");
      return false;
    }
    setSelectedGraph(result.payload.flow);
    setSelectedGraphDraft(null);
    setGraphDirty(false);
    return true;
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  const routerReferences = selectedSubflow ? routerReferencesForSubflow(router, selectedSubflow.subflowId) : [];
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Subflows</strong><span>{props.flow?.name ?? "Select a Flow"}</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId} onClick={createSubflow} type="button">Create</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Flow Subflows</strong><span>{loading ? "Loading..." : `${page.total ? page.offset + 1 : 0}-${Math.min(page.total, page.offset + subflows.length)} of ${page.total}`}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={loading || page.offset <= 0} onClick={() => loadSubflows(previousOffset)} type="button">Previous</button>
              <button disabled={loading || nextOffset >= page.total} onClick={() => loadSubflows(nextOffset)} type="button">Next</button>
            </div>
          </header>
          <DataTable columns={["Name", "Role", "Status", "Updated", "Stability", ""]} rows={subflows.map((subflow) => [
            <strong key={`${subflow.subflowId}:name`}>{subflow.name ?? subflow.subflowId}</strong>,
            subflow.role ?? "-",
            <StatusBadge key={`${subflow.subflowId}:status`} value={subflow.status ?? "active"} />,
            formatRuntimeTimestamp(subflow.updatedAt),
            `${subflow.stability?.successCount ?? 0}/${subflow.stability?.runCount ?? 0}`,
            <button className="automation-runtime-row-action" key={`${subflow.subflowId}:open`} onClick={() => openSubflow(subflow.subflowId)} type="button">Open</button>
          ])} empty={flowId ? "No subflows are defined for this Flow." : "Select a Flow to manage subflows."} />
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>{selectedSubflow?.name ?? "Subflow Detail"}</strong><span>{selectedSubflow?.subflowId ?? "Open a row to inspect details."}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={!selectedSubflow} onClick={renameSubflow} type="button">Rename</button>
              <button disabled={!selectedSubflow} onClick={() => mutateSubflow("disable-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow?.subflowId })} type="button">Disable</button>
              <button disabled={!selectedSubflow} onClick={() => mutateSubflow("archive-flow-subflow", { projectId: props.projectId, flowId, subflowId: selectedSubflow?.subflowId })} type="button">Archive</button>
            </div>
          </header>
          {selectedSubflow ? (
            <>
              <SummaryStrip items={[["Role", selectedSubflow.role ?? "-"], ["Status", selectedSubflow.status ?? "-"], ["Graph", selectedSubflow.graphFlowId ?? flowId], ["Instructions", selectedSubflow.localInstructionIds?.length ?? 0]]} />
              <DataTable columns={["Router Reference", "Status", "Order", "Condition"]} rows={routerReferences.map((reference) => [
                reference.name,
                <StatusBadge key={`${reference.id}:status`} value={reference.status} />,
                reference.order,
                reference.condition
              ])} empty="No router rules or fallback currently target this subflow." />
              <DataTable columns={["Mapping", "Source", "Target", "Required"]} rows={[...(selectedSubflow.inputMapping ?? []).map((item: any) => ["Input", item.flowInputId, item.subflowInputId, item.required ? "Yes" : "No"]), ...(selectedSubflow.outputMapping ?? []).map((item: any) => ["Output", item.subflowOutputId, item.flowOutputId, item.required ? "Yes" : "No"])]} empty="No input or output mappings configured." />
              <section className="automation-runtime-log-section">
                <header><strong>Graph</strong><span>{loadingGraph ? "Loading graph..." : graphDirty ? "Unsaved subflow graph changes" : selectedGraph?.flowId ?? "No graph loaded"}</span></header>
                {selectedGraph ? (
                  <div style={{ minHeight: 520 }}>
                    <AutomationPolicyCanvas
                      active
                      editable={selectedGraph?.source?.mode !== "code"}
                      entries={[]}
                      nativeNodeDefinitions={props.nativeNodeDefinitions}
                      onDirtyChange={setGraphDirty}
                      onGraphDraftChange={setSelectedGraphDraft}
                      onSaveGraph={saveSelectedSubflowGraph}
                      policy={null}
                      recordings={props.recordings}
                      selectedNode={props.selectedNode}
                      selectedTimeline={props.selectedTimeline}
                      setSelection={props.setSelection}
                      signals={props.signals}
                      taskGraph={selectedGraph}
                      taskGraphDraft={selectedGraphDraft}
                    />
                  </div>
                ) : <p className="automation-runtime-empty">{loadingGraph ? "Loading subflow graph..." : "No graph Flow is linked to this subflow."}</p>}
              </section>
              <JsonToggle label="Show Subflow JSON" value={selectedSubflow} />
            </>
          ) : <p className="automation-runtime-empty">No subflow selected.</p>}
        </section>
      </div>
    </section>
  );
}
export function AutomationProblemsWorkspace(props: { problems: any[] }) {
  return <DataTable columns={["Severity", "Artifact", "Message"]} rows={props.problems.map((problem) => [<StatusBadge key={problem.id} value={problem.severity} />, problem.artifactId ?? problem.artifactKind ?? "-", problem.message])} empty="No validation, runtime, or fixture problems are currently reported." />;
}

const RUNTIME_RUN_PAGE_SIZE = 25;
const RUNTIME_ACTION_PAGE_SIZE = 50;
const ADAPTATION_PAGE_SIZE = 25;
const ADAPTATION_STATUSES = ["proposed", "testing", "validated", "applied", "rejected", "disabled", "reverted", "superseded"];
const WORKBENCH_PAGE_SIZE = 25;

export function AutomationRouterWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [router, setRouter] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    void api.post<{ router?: any }>("get-flow-router", { projectId: props.projectId, flowId }).then((result) => {
      setLoading(false);
      if (!result.ok) setError(result.error ?? "Router could not be loaded.");
      else setRouter(result.payload?.router ?? null);
    });
  }, [props.projectId, flowId]);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Router</strong><span>{loading ? "Loading..." : router?.name ?? "Deterministic Flow routing"}</span></div></header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <SummaryStrip items={[["Rules", router?.rules?.length ?? 0], ["Status", router?.status ?? "-"], ["Fallback", routerFallbackLabel(router)], ["Flow", flowId ?? "-"]]} />
      <section className="automation-runtime-log-section">
        <header><strong>Route Rules</strong><span>order-first</span></header>
        <DataTable columns={["Order", "Rule", "Status", "Target", "Condition"]} rows={(router?.rules ?? []).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0)).map((rule: any) => [
          rule.order ?? "-",
          rule.name ?? rule.ruleId,
          <StatusBadge key={`${rule.ruleId}:status`} value={rule.status ?? "active"} />,
          rule.target?.kind === "subflow" ? rule.target.subflowId : "-",
          rule.condition ? compactConditionLabel(rule.condition) : "Always"
        ])} empty={flowId ? "No router rules are defined for this Flow." : "Select a Flow to inspect routing."} />
      </section>
      <JsonToggle label="Show Router JSON" value={router ?? {}} />
    </section>
  );
}

export function AutomationInstructionsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [instructions, setInstructions] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: WORKBENCH_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedInstruction, setSelectedInstruction] = useState<any | null>(null);
  const [draftInstruction, setDraftInstruction] = useState({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
  const [error, setError] = useState("");
  useEffect(() => {
    setSelectedInstruction(null);
    setDraftInstruction({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
    if (!props.projectId || !flowId) return;
    void loadInstructions(0);
  }, [props.projectId, flowId]);
  const loadInstructions = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ instructions?: any[]; page?: { instructions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-instructions", { projectId: props.projectId, flowId, limit: WORKBENCH_PAGE_SIZE, offset });
    if (!result.ok) { setError(result.error ?? "Instructions could not be loaded."); return; }
    const resultPage = result.payload?.page;
    setInstructions(result.payload?.instructions ?? resultPage?.instructions ?? []);
    setPage({ limit: resultPage?.limit ?? WORKBENCH_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.instructions?.length ?? 0 });
  };
  const openInstructionSet = async (instructionId: string) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ instructions?: any[] }>("get-flow-instruction-set", { projectId: props.projectId, flowId });
    if (!result.ok) { setError(result.error ?? "Instruction detail could not be loaded."); return; }
    const instruction = (result.payload?.instructions ?? []).find((item) => item.instructionId === instructionId) ?? null;
    setSelectedInstruction(instruction);
    setDraftInstruction(instructionDraftFromInstruction(instruction));
  };
  const createInstruction = () => {
    setSelectedInstruction(null);
    setDraftInstruction({ instructionId: "", title: "", body: "", scopeKind: "flow", priority: 50, requirement: "advisory", status: "active" });
  };
  const saveInstruction = async () => {
    if (!props.projectId || !flowId) return;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    setError("");
    const result = await api.post<{ instruction?: any }>("save-flow-instruction", {
      projectId: props.projectId,
      flowId,
      authorizationPin,
      ...(draftInstruction.instructionId ? { instructionId: draftInstruction.instructionId } : {}),
      title: draftInstruction.title,
      body: draftInstruction.body,
      scopeKind: draftInstruction.scopeKind,
      priority: draftInstruction.priority,
      requirement: draftInstruction.requirement,
      status: draftInstruction.status
    });
    if (!result.ok || !result.payload?.instruction) {
      setError(result.error ?? "Instruction could not be saved.");
      return;
    }
    setSelectedInstruction(result.payload.instruction);
    setDraftInstruction(instructionDraftFromInstruction(result.payload.instruction));
    await loadInstructions(page.offset);
  };
  const diagnostics = instructionDiagnostics(selectedInstruction ? [selectedInstruction] : instructions);
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Instructions</strong><span>Scoped prompt guidance and precedence</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId} onClick={createInstruction} type="button">New</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-instructions-workspace">
        <section className="automation-instruction-list-pane">
          <header>
            <div><strong>Instruction Library</strong><span>{page.total ? `${page.offset + 1}-${Math.min(page.total, page.offset + instructions.length)} of ${page.total}` : "0 instructions"}</span></div>
          </header>
          <div className="automation-instruction-list">
            {instructions.map((instruction) => {
              const selected = selectedInstruction?.instructionId === instruction.instructionId;
              return (
                <button className={selected ? "selected" : ""} key={instruction.instructionId} onClick={() => openInstructionSet(instruction.instructionId)} type="button">
                  <span className="automation-instruction-title">{instruction.title ?? instruction.instructionId}</span>
                  <span className="automation-instruction-meta">{instruction.scopeKind ?? instruction.scope?.kind ?? "flow"} | priority {instruction.priority ?? 0}</span>
                  <span className="automation-instruction-footer">
                    <StatusBadge value={instruction.status ?? "active"} />
                    <small>{instruction.requirement ?? "advisory"}</small>
                  </span>
                </button>
              );
            })}
            {!instructions.length ? <p className="automation-runtime-empty">{flowId ? "No scoped instructions are defined." : "Select a Flow to review instructions."}</p> : null}
          </div>
        </section>
        <section className="automation-instruction-editor-pane">
          <header>
            <div><strong>Instruction Editor</strong><span>{selectedInstruction?.instructionId ?? "New instruction"}</span></div>
            <button className="automation-runtime-row-action" disabled={!props.projectId || !flowId || !draftInstruction.title.trim() || !draftInstruction.body.trim()} onClick={saveInstruction} type="button">Save</button>
          </header>
          <div className="automation-instruction-editor-card">
            <label><span>Title</span><input value={draftInstruction.title} onChange={(event) => setDraftInstruction((current) => ({ ...current, title: event.target.value }))} placeholder="Instruction title" /></label>
            <label><span>Scope</span><select value={draftInstruction.scopeKind} onChange={(event) => setDraftInstruction((current) => ({ ...current, scopeKind: event.target.value }))}>
              <option value="flow">Flow</option>
              <option value="router">Router</option>
              <option value="subflow">Subflow</option>
              <option value="node">Node</option>
              <option value="on_error">On Error</option>
              <option value="adaptation_review">Adaptation Review</option>
            </select></label>
            <label><span>Requirement</span><select value={draftInstruction.requirement} onChange={(event) => setDraftInstruction((current) => ({ ...current, requirement: event.target.value }))}>
              <option value="advisory">Advisory</option>
              <option value="required">Required</option>
            </select></label>
            <label><span>Status</span><select value={draftInstruction.status} onChange={(event) => setDraftInstruction((current) => ({ ...current, status: event.target.value }))}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </select></label>
            <label><span>Priority</span><input type="number" value={draftInstruction.priority} onChange={(event) => setDraftInstruction((current) => ({ ...current, priority: Number(event.target.value) }))} /></label>
            <label className="automation-instruction-body-field"><span>Body</span><textarea rows={9} value={draftInstruction.body} onChange={(event) => setDraftInstruction((current) => ({ ...current, body: event.target.value }))} placeholder="Tell FluxIQ what to prefer, avoid, require, or clarify for this Flow." /></label>
          </div>
          <section className="automation-instruction-diagnostics">
            <header><strong>Diagnostics</strong><span>{diagnostics.length ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}` : "Clean"}</span></header>
            {diagnostics.length ? diagnostics.map((diagnostic) => <article key={diagnostic.code}><strong>{diagnostic.code}</strong><span>{diagnostic.message}</span></article>) : <p>No instruction conflicts detected.</p>}
          </section>
          {selectedInstruction ? <JsonToggle label="Show Instruction JSON" value={selectedInstruction} /> : null}
        </section>
      </div>
    </section>
  );
}

export function AutomationChangeProposalsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [proposals, setProposals] = useState<any[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    void api.post<{ changeProposals?: any[]; page?: { changeProposals?: any[] } }>("list-flow-change-proposals", { projectId: props.projectId, flowId, limit: WORKBENCH_PAGE_SIZE, offset: 0 }).then((result) => {
      if (!result.ok) setError(result.error ?? "Change proposals could not be loaded.");
      else setProposals(result.payload?.changeProposals ?? result.payload?.page?.changeProposals ?? []);
    });
  }, [props.projectId, flowId]);
  const openProposal = async (proposalId: string) => {
    if (!props.projectId || !flowId) return;
    const result = await api.post<{ changeProposal?: any }>("get-flow-change-proposal", { projectId: props.projectId, flowId, proposalId });
    if (!result.ok) { setError(result.error ?? "Change proposal detail could not be loaded."); return; }
    setSelectedProposal(result.payload?.changeProposal ?? null);
  };
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Change Proposals</strong><span>Approval gates for generated edits</span></div></header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <DataTable columns={["Proposal", "Mode", "Status", "Risk", "Patches", ""]} rows={proposals.map((proposal) => [
            proposal.proposalId,
            proposal.mode ?? "-",
            <StatusBadge key={`${proposal.proposalId}:status`} value={proposal.status ?? "pending"} />,
            proposal.riskLevel ?? "-",
            proposal.patchCount ?? proposal.patches?.length ?? 0,
            <button className="automation-runtime-row-action" key={`${proposal.proposalId}:open`} onClick={() => openProposal(proposal.proposalId)} type="button">Open</button>
          ])} empty={flowId ? "No change proposals are waiting for this Flow." : "Select a Flow to review change proposals."} />
        </section>
        <section className="automation-runtime-log-page">
          <header><div><strong>Diff Preview</strong><span>{selectedProposal?.proposalId ?? "No proposal selected"}</span></div>{selectedProposal ? <StatusBadge value={selectedProposal.status ?? "pending"} /> : null}</header>
          <DataTable columns={["Kind", "Target", "Summary", "Before", "After"]} rows={(selectedProposal?.patches ?? []).map((patch: any, index: number) => [
            patch.kind ?? "-",
            patch.targetId ?? "-",
            patch.summary ?? "-",
            <JsonToggle key={`${index}:before`} label="Before JSON" value={patch.before ?? {}} />,
            <JsonToggle key={`${index}:after`} label="After JSON" value={patch.after ?? {}} />
          ])} empty="Select a proposal to inspect its patch diff." />
          {selectedProposal ? <JsonToggle label="Show Proposal JSON" value={selectedProposal} /> : null}
        </section>
      </div>
    </section>
  );
}

type FlowSettingsDraft = {
  name: string;
  description: string;
  visibility: "private" | "public";
  trainingMode: "normal" | "train_for_runs" | "train_until_stable" | "continuous_adaptive";
  trainForRunCount: string;
  minimumStabilityScore: string;
  proposalApprovalMode: "auto" | "manual" | "mixed";
  adaptationPreset: "locked" | "observe" | "repair" | "adaptive" | "autonomous";
  adaptationProposalMode: "auto" | "manual" | "mixed";
  allowLlmIntervention: boolean;
  allowRuntimeRecovery: boolean;
  allowAdaptationCreation: boolean;
  allowPromotion: boolean;
  allowCreateRecoveryPaths: boolean;
  allowModifySubflows: boolean;
  allowCreateSubflows: boolean;
  allowModifyRouter: boolean;
  allowModifyExpectations: boolean;
  allowModifyActionTargets: boolean;
  allowDeleteOrDisableBehavior: boolean;
  allowExternalSideEffects: boolean;
  requireApprovalForDestructiveChanges: boolean;
  requireApprovalForExternalSideEffects: boolean;
  maxInterventionsPerRun: string;
  maxTokensPerRun: string;
  maxCostUsdPerTrainingWindow: string;
  maxAdaptationInterventionsPerRun: string;
  maxAdaptationCostUsdPerRun: string;
  budgetExhaustedBehavior: "ask" | "stop";
  llmProvider: string;
  adaptationPolicyId: string;
};

export function AutomationFlowSettingsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const [savedFlow, setSavedFlow] = useState<any | null>(null);
  const flow = savedFlow?.flowId && savedFlow.flowId === props.flow?.flowId ? savedFlow : props.flow;
  const metadata = flowSettingsMetadata(flow);
  const [draft, setDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSavedFlow(null);
    setDraft(flowSettingsDraftFromFlow(props.flow));
    setMessage("");
    setError("");
  }, [props.flow?.flowId]);
  const updateDraft = <K extends keyof FlowSettingsDraft>(key: K, value: FlowSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const saveSettings = async () => {
    if (!props.projectId || !flow?.flowId) return;
    const authorizationPin = window.prompt("Authorization PIN");
    if (!authorizationPin) return;
    setSaving(true);
    setMessage("");
    setError("");
    const result = await api.post<{ flow?: any }>("save-flow", {
      projectId: props.projectId,
      authorizationPin,
      flow: buildFlowSettingsSavePayload(flow, draft)
    });
    setSaving(false);
    if (!result.ok || !result.payload?.flow) {
      setError(result.error ?? "Flow settings could not be saved.");
      return;
    }
    setSavedFlow(result.payload.flow);
    setDraft(flowSettingsDraftFromFlow(result.payload.flow));
    setMessage("Settings saved.");
  };
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace">
      <header>
        <div><strong>Settings</strong><span>{flow?.name ?? "Select a Flow"} | training, approval, LLM, and safety gates</span></div>
        <button className="automation-runtime-row-action" disabled={!props.projectId || !flow?.flowId || saving} onClick={() => void saveSettings()} type="button">{saving ? "Saving..." : "Save Settings"}</button>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      {message ? <p className="automation-settings-success">{message}</p> : null}
      <div className="automation-flow-settings-grid">
        <section className="automation-settings-panel">
          <header><strong>Flow Identity</strong><span>Name, description, and catalog visibility</span></header>
          <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Flow name" /></label>
          <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this Flow is responsible for." /></label>
          <label><span>Visibility</span><select value={draft.visibility} onChange={(event) => updateDraft("visibility", event.target.value as FlowSettingsDraft["visibility"])}><option value="private">Private</option><option value="public">Public composite candidate</option></select></label>
        </section>
        <section className="automation-settings-panel">
          <header><strong>Training Mode</strong><span>How much help the runtime may ask from the LLM</span></header>
          <label><span>Mode</span><select value={draft.trainingMode} onChange={(event) => updateDraft("trainingMode", event.target.value as FlowSettingsDraft["trainingMode"])}><option value="normal">Normal deterministic</option><option value="train_for_runs">Train for fixed runs</option><option value="train_until_stable">Train until stable</option><option value="continuous_adaptive">Continuous adaptive</option></select></label>
          <div className="automation-settings-inline-fields">
            <label><span>Train runs</span><input min={0} type="number" value={draft.trainForRunCount} onChange={(event) => updateDraft("trainForRunCount", event.target.value)} /></label>
            <label><span>Stability target</span><input max={1} min={0} step={0.01} type="number" value={draft.minimumStabilityScore} onChange={(event) => updateDraft("minimumStabilityScore", event.target.value)} /></label>
          </div>
          <label><span>Proposal approval</span><select value={draft.proposalApprovalMode} onChange={(event) => updateDraft("proposalApprovalMode", event.target.value as FlowSettingsDraft["proposalApprovalMode"])}><option value="auto">Auto approve safe edits</option><option value="manual">Manual approval only</option><option value="mixed">Mixed by risk/policy</option></select></label>
        </section>
        <section className="automation-settings-panel">
          <header><strong>Runtime Safety</strong><span>Deterministic gates before learned changes become behavior</span></header>
          <SettingsToggle checked={draft.allowRuntimeRecovery} label="Allow runtime recovery" onChange={(checked) => updateDraft("allowRuntimeRecovery", checked)} />
          <SettingsToggle checked={draft.allowLlmIntervention} label="Allow LLM intervention" onChange={(checked) => updateDraft("allowLlmIntervention", checked)} />
          <SettingsToggle checked={draft.allowAdaptationCreation} label="Create adaptation proposals" onChange={(checked) => updateDraft("allowAdaptationCreation", checked)} />
          <SettingsToggle checked={draft.allowPromotion} label="Promote validated adaptations" onChange={(checked) => updateDraft("allowPromotion", checked)} />
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide">
          <header><strong>Adaptations</strong><span>What the runtime may learn, propose, edit, and promote</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Policy preset</span><select value={draft.adaptationPreset} onChange={(event) => updateDraft("adaptationPreset", event.target.value as FlowSettingsDraft["adaptationPreset"])}><option value="locked">Locked</option><option value="observe">Observe only</option><option value="repair">Repair</option><option value="adaptive">Adaptive</option><option value="autonomous">Autonomous</option></select></label>
            <label><span>Adaptation proposal mode</span><select value={draft.adaptationProposalMode} onChange={(event) => updateDraft("adaptationProposalMode", event.target.value as FlowSettingsDraft["adaptationProposalMode"])}><option value="auto">Auto approve safe validated changes</option><option value="manual">Manual approval only</option><option value="mixed">Manual for risky or structural changes</option></select></label>
          </div>
          <div className="automation-settings-toggle-grid">
            <SettingsToggle checked={draft.allowCreateRecoveryPaths} label="Create recovery paths" onChange={(checked) => updateDraft("allowCreateRecoveryPaths", checked)} />
            <SettingsToggle checked={draft.allowModifyRouter} label="Modify router rules" onChange={(checked) => updateDraft("allowModifyRouter", checked)} />
            <SettingsToggle checked={draft.allowModifySubflows} label="Modify subflows" onChange={(checked) => updateDraft("allowModifySubflows", checked)} />
            <SettingsToggle checked={draft.allowCreateSubflows} label="Create subflows" onChange={(checked) => updateDraft("allowCreateSubflows", checked)} />
            <SettingsToggle checked={draft.allowModifyExpectations} label="Modify expectations" onChange={(checked) => updateDraft("allowModifyExpectations", checked)} />
            <SettingsToggle checked={draft.allowModifyActionTargets} label="Modify action targets" onChange={(checked) => updateDraft("allowModifyActionTargets", checked)} />
            <SettingsToggle checked={draft.allowDeleteOrDisableBehavior} label="Delete or disable behavior" onChange={(checked) => updateDraft("allowDeleteOrDisableBehavior", checked)} />
            <SettingsToggle checked={draft.allowExternalSideEffects} label="Allow external side effects" onChange={(checked) => updateDraft("allowExternalSideEffects", checked)} />
            <SettingsToggle checked={draft.requireApprovalForDestructiveChanges} label="Require approval for destructive changes" onChange={(checked) => updateDraft("requireApprovalForDestructiveChanges", checked)} />
            <SettingsToggle checked={draft.requireApprovalForExternalSideEffects} label="Require approval for external side effects" onChange={(checked) => updateDraft("requireApprovalForExternalSideEffects", checked)} />
          </div>
          <div className="automation-settings-inline-fields">
            <label><span>Adaptation interventions/run</span><input min={0} type="number" value={draft.maxAdaptationInterventionsPerRun} onChange={(event) => updateDraft("maxAdaptationInterventionsPerRun", event.target.value)} /></label>
            <label><span>Adaptation cost/run</span><input min={0} step={0.01} type="number" value={draft.maxAdaptationCostUsdPerRun} onChange={(event) => updateDraft("maxAdaptationCostUsdPerRun", event.target.value)} /></label>
          </div>
        </section>
        <section className="automation-settings-panel">
          <header><strong>LLM Budget</strong><span>Caps for intervention frequency, token use, and spend</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Max interventions/run</span><input min={0} type="number" value={draft.maxInterventionsPerRun} onChange={(event) => updateDraft("maxInterventionsPerRun", event.target.value)} /></label>
            <label><span>Max tokens/run</span><input min={0} type="number" value={draft.maxTokensPerRun} onChange={(event) => updateDraft("maxTokensPerRun", event.target.value)} /></label>
          </div>
          <label><span>Max cost/training window</span><input min={0} step={0.01} type="number" value={draft.maxCostUsdPerTrainingWindow} onChange={(event) => updateDraft("maxCostUsdPerTrainingWindow", event.target.value)} /></label>
          <label><span>When exhausted</span><select value={draft.budgetExhaustedBehavior} onChange={(event) => updateDraft("budgetExhaustedBehavior", event.target.value as FlowSettingsDraft["budgetExhaustedBehavior"])}><option value="ask">Ask before continuing</option><option value="stop">Stop training</option></select></label>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide">
          <header><strong>Provider and Policy</strong><span>Host model boundary plus the adaptation policy used by this Flow</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>LLM provider</span><input value={draft.llmProvider} onChange={(event) => updateDraft("llmProvider", event.target.value)} placeholder="host" /></label>
            <label><span>Adaptation policy ID</span><input value={draft.adaptationPolicyId} onChange={(event) => updateDraft("adaptationPolicyId", event.target.value)} placeholder="policy/default" /></label>
          </div>
          <DataTable columns={["Setting", "Current"]} rows={[
            ["Instruction precedence", "global -> project -> Flow -> router -> subflow -> node -> on-error -> review"],
            ["Source ownership", flow?.source?.mode ?? "visual"],
            ["Publication", flow?.publication?.status ?? "draft"],
            ["Frozen scopes", metadata.frozenScopeCount ?? 0]
          ]} empty="No settings." />
        </section>
      </div>
      <JsonToggle label="Show Flow Settings JSON" value={metadata} />
    </section>
  );
}

function SettingsToggle(props: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return <label className="automation-settings-toggle"><input checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} type="checkbox" /><span>{props.label}</span></label>;
}

function flowSettingsDraftFromFlow(flow: any): FlowSettingsDraft {
  const metadata = flowSettingsMetadata(flow);
  const trainingSettings = metadata.trainingModeSettings && typeof metadata.trainingModeSettings === "object" ? metadata.trainingModeSettings : {};
  const adaptationSettings = metadata.adaptationPolicySettings && typeof metadata.adaptationPolicySettings === "object" ? metadata.adaptationPolicySettings : {};
  const budgets = trainingSettings.budgets && typeof trainingSettings.budgets === "object" ? trainingSettings.budgets : {};
  const trainingMode = flowSettingsTrainingMode(trainingSettings.mode ?? metadata.trainingMode);
  const proposalApprovalMode = flowSettingsProposalMode(trainingSettings.proposalApprovalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode);
  const adaptationProposalMode = flowSettingsProposalMode(adaptationSettings.proposalMode ?? proposalApprovalMode);
  return {
    name: String(flow?.name ?? ""),
    description: String(flow?.description ?? ""),
    visibility: flow?.visibility === "public" ? "public" : "private",
    trainingMode,
    trainForRunCount: numberInputValue(trainingSettings.trainForRunCount ?? metadata.trainForRunCount),
    minimumStabilityScore: numberInputValue(trainingSettings.minimumStabilityScore ?? metadata.minimumStabilityScore),
    proposalApprovalMode,
    adaptationPreset: flowSettingsAdaptationPreset(adaptationSettings.preset),
    adaptationProposalMode,
    allowLlmIntervention: booleanSetting(trainingSettings.allowLlmIntervention, trainingMode !== "normal"),
    allowRuntimeRecovery: booleanSetting(trainingSettings.allowRuntimeRecovery, true),
    allowAdaptationCreation: booleanSetting(trainingSettings.allowAdaptationCreation, trainingMode !== "normal"),
    allowPromotion: booleanSetting(trainingSettings.allowPromotion, trainingMode === "continuous_adaptive"),
    allowCreateRecoveryPaths: booleanSetting(adaptationSettings.allowCreateRecoveryPaths, true),
    allowModifySubflows: booleanSetting(adaptationSettings.allowModifySubflows, true),
    allowCreateSubflows: booleanSetting(adaptationSettings.allowCreateSubflows, true),
    allowModifyRouter: booleanSetting(adaptationSettings.allowModifyRouter, true),
    allowModifyExpectations: booleanSetting(adaptationSettings.allowModifyExpectations, true),
    allowModifyActionTargets: booleanSetting(adaptationSettings.allowModifyActionTargets, true),
    allowDeleteOrDisableBehavior: booleanSetting(adaptationSettings.allowDeleteOrDisableBehavior, false),
    allowExternalSideEffects: booleanSetting(adaptationSettings.allowExternalSideEffects, false),
    requireApprovalForDestructiveChanges: booleanSetting(adaptationSettings.requireApprovalForDestructiveChanges, true),
    requireApprovalForExternalSideEffects: booleanSetting(adaptationSettings.requireApprovalForExternalSideEffects, true),
    maxInterventionsPerRun: numberInputValue(budgets.maxInterventionsPerRun ?? metadata.maxInterventionsPerRun),
    maxTokensPerRun: numberInputValue(budgets.maxTokensPerRun ?? metadata.maxTokensPerRun),
    maxCostUsdPerTrainingWindow: numberInputValue(budgets.maxCostUsdPerTrainingWindow ?? metadata.maxCostUsdPerTrainingWindow),
    maxAdaptationInterventionsPerRun: numberInputValue(adaptationSettings.maxInterventionsPerRun),
    maxAdaptationCostUsdPerRun: numberInputValue(adaptationSettings.maxEstimatedCostUsdPerRun),
    budgetExhaustedBehavior: budgets.exhaustedBehavior === "stop" || metadata.budgetExhaustedBehavior === "stop" ? "stop" : "ask",
    llmProvider: String(metadata.llmProvider ?? ""),
    adaptationPolicyId: String(metadata.adaptationPolicyId ?? "")
  };
}

function buildFlowSettingsSavePayload(flow: any, draft: FlowSettingsDraft) {
  const metadata = flowSettingsMetadata(flow);
  const { llmProvider: _oldLlmProvider, adaptationPolicyId: _oldAdaptationPolicyId, ...retainedMetadata } = metadata;
  const llmProvider = draft.llmProvider.trim();
  const adaptationPolicyId = draft.adaptationPolicyId.trim();
  const trainingModeSettings = {
    mode: draft.trainingMode,
    ...(numberOrUndefined(draft.trainForRunCount) !== undefined ? { trainForRunCount: numberOrUndefined(draft.trainForRunCount) } : {}),
    ...(numberOrUndefined(draft.minimumStabilityScore) !== undefined ? { minimumStabilityScore: numberOrUndefined(draft.minimumStabilityScore) } : {}),
    allowLlmIntervention: draft.allowLlmIntervention,
    allowRuntimeRecovery: draft.allowRuntimeRecovery,
    allowAdaptationCreation: draft.allowAdaptationCreation,
    proposalApprovalMode: draft.proposalApprovalMode,
    allowPromotion: draft.allowPromotion,
    budgets: {
      ...(numberOrUndefined(draft.maxInterventionsPerRun) !== undefined ? { maxInterventionsPerRun: numberOrUndefined(draft.maxInterventionsPerRun) } : {}),
      ...(numberOrUndefined(draft.maxTokensPerRun) !== undefined ? { maxTokensPerRun: numberOrUndefined(draft.maxTokensPerRun) } : {}),
      ...(numberOrUndefined(draft.maxCostUsdPerTrainingWindow) !== undefined ? { maxCostUsdPerTrainingWindow: numberOrUndefined(draft.maxCostUsdPerTrainingWindow) } : {}),
      exhaustedBehavior: draft.budgetExhaustedBehavior
    }
  };
  const adaptationPolicySettings = {
    preset: draft.adaptationPreset,
    proposalMode: draft.adaptationProposalMode,
    allowRuntimeRecovery: draft.allowRuntimeRecovery,
    allowCreateRecoveryPaths: draft.allowCreateRecoveryPaths,
    allowModifySubflows: draft.allowModifySubflows,
    allowCreateSubflows: draft.allowCreateSubflows,
    allowModifyRouter: draft.allowModifyRouter,
    allowModifyExpectations: draft.allowModifyExpectations,
    allowModifyActionTargets: draft.allowModifyActionTargets,
    allowDeleteOrDisableBehavior: draft.allowDeleteOrDisableBehavior,
    allowExternalSideEffects: draft.allowExternalSideEffects,
    requireApprovalForDestructiveChanges: draft.requireApprovalForDestructiveChanges,
    requireApprovalForExternalSideEffects: draft.requireApprovalForExternalSideEffects,
    ...(numberOrUndefined(draft.maxAdaptationInterventionsPerRun) !== undefined ? { maxInterventionsPerRun: numberOrUndefined(draft.maxAdaptationInterventionsPerRun) } : {}),
    ...(numberOrUndefined(draft.maxAdaptationCostUsdPerRun) !== undefined ? { maxEstimatedCostUsdPerRun: numberOrUndefined(draft.maxAdaptationCostUsdPerRun) } : {})
  };
  return {
    ...flow,
    name: draft.name.trim() || flow.name,
    description: draft.description.trim(),
    visibility: draft.visibility,
    metadata: {
      ...retainedMetadata,
      trainingMode: draft.trainingMode,
      proposalMode: draft.proposalApprovalMode,
      proposalApprovalMode: draft.proposalApprovalMode,
      trainingModeSettings,
      adaptationPolicySettings,
      budgetExhaustedBehavior: draft.budgetExhaustedBehavior,
      ...(llmProvider ? { llmProvider } : {}),
      ...(adaptationPolicyId ? { adaptationPolicyId } : {})
    }
  };
}

function flowSettingsMetadata(flow: any) {
  const existingMetadata = flow?.metadata ?? {};
  const trainingModeSettings = {
    mode: "normal",
    trainForRunCount: 3,
    minimumStabilityScore: 0.9,
    allowLlmIntervention: false,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: false,
    proposalApprovalMode: "auto",
    allowPromotion: false,
    budgets: {
      maxInterventionsPerRun: 2,
      maxTokensPerRun: 12000,
      maxCostUsdPerTrainingWindow: 5,
      exhaustedBehavior: "ask"
    }
  };
  const adaptationPolicySettings = {
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1
  };
  const existingAdaptationSettings = existingMetadata.adaptationPolicySettings && typeof existingMetadata.adaptationPolicySettings === "object" ? existingMetadata.adaptationPolicySettings : {};
  const mergedTrainingModeSettings = {
    ...trainingModeSettings,
    ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" ? existingMetadata.trainingModeSettings : {}),
    budgets: {
      ...trainingModeSettings.budgets,
      ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" && existingMetadata.trainingModeSettings.budgets && typeof existingMetadata.trainingModeSettings.budgets === "object" ? existingMetadata.trainingModeSettings.budgets : {})
    }
  };
  return {
    trainingMode: trainingModeSettings.mode,
    proposalMode: trainingModeSettings.proposalApprovalMode,
    proposalApprovalMode: trainingModeSettings.proposalApprovalMode,
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    adaptationPolicySettings: { ...adaptationPolicySettings, ...existingAdaptationSettings },
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0,
    ...existingMetadata,
    trainingModeSettings: mergedTrainingModeSettings
  };
}

function flowSettingsTrainingMode(value: unknown): FlowSettingsDraft["trainingMode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "continuous_adaptive" ? value : "normal";
}

function flowSettingsProposalMode(value: unknown): FlowSettingsDraft["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

function flowSettingsAdaptationPreset(value: unknown): FlowSettingsDraft["adaptationPreset"] {
  return value === "locked" || value === "observe" || value === "repair" || value === "autonomous" ? value : "adaptive";
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberInputValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function AutomationAdaptationsWorkspace(props: { projectId: string | null; flow: any }) {
  const api = useProgramApi("automation-studio");
  const flowId = props.flow?.flowId;
  const [status, setStatus] = useState("proposed");
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedAdaptation, setSelectedAdaptation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.projectId || !flowId) return;
    void loadAdaptations(status, 0);
  }, [props.projectId, flowId, status]);
  const loadAdaptations = async (nextStatus: string, offset: number) => {
    if (!props.projectId || !flowId) return;
    setLoading(true);
    setError("");
    const result = await api.post<{ adaptations?: any[]; page?: { adaptations?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-adaptations", { projectId: props.projectId, flowId, status: nextStatus, limit: ADAPTATION_PAGE_SIZE, offset });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Adaptations could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setAdaptations(result.payload?.adaptations ?? resultPage?.adaptations ?? []);
    setPage({ limit: resultPage?.limit ?? ADAPTATION_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.adaptations?.length ?? 0 });
  };
  const openAdaptation = async (adaptationId: string) => {
    if (!props.projectId || !flowId) return;
    setLoadingDetail(true);
    setError("");
    const result = await api.post<{ adaptation?: any }>("get-flow-adaptation", { projectId: props.projectId, flowId, adaptationId });
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.adaptation) {
      setError(result.error ?? "Adaptation detail could not be loaded.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
  };
  const reviewAdaptation = async (action: string) => {
    if (!props.projectId || !flowId || !selectedAdaptation) return;
    const authorizationPin = window.prompt(`Enter PIN to ${action.replace(/_/g, " ")} this adaptation`) ?? "";
    if (!authorizationPin) return;
    const reason = action === "reject" || action === "supersede" ? window.prompt("Reason") ?? "" : "";
    const result = await api.post<{ adaptation?: any }>("review-flow-adaptation", { projectId: props.projectId, flowId, adaptationId: selectedAdaptation.adaptationId, action, authorizationPin, ...(reason ? { reason } : {}) });
    if (!result.ok) {
      setError(result.error ?? "Adaptation review action failed.");
      return;
    }
    setSelectedAdaptation(result.payload?.adaptation ?? null);
    void loadAdaptations(status, page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Adaptations</strong><span>Review runtime fixes and promotion evidence</span></div></header>
      <AutomationTrainingStatusPanel status={{ mode: props.flow?.metadata?.trainingMode ?? "normal", runsCompleted: 0, stabilityScore: props.flow?.metadata?.stabilityScore ?? 0, learnedChangeCount: 0, pendingProposalCount: 0, uncertainty: [], frozenScopeCount: props.flow?.metadata?.frozenScopeCount ?? 0 }} />
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      <div className="automation-runtime-debugger">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Inbox</strong><span>{loading ? "Loading..." : `${page.total ? page.offset + 1 : 0}-${Math.min(page.total, page.offset + adaptations.length)} of ${page.total}`}</span></div>
            <div className="automation-runtime-pagination">
              <button disabled={loading || page.offset <= 0} onClick={() => loadAdaptations(status, previousOffset)} type="button">Previous</button>
              <button disabled={loading || nextOffset >= page.total} onClick={() => loadAdaptations(status, nextOffset)} type="button">Next</button>
            </div>
          </header>
          <div className="automation-runtime-log-toolbar">
            <div>{ADAPTATION_STATUSES.map((item) => <button className={item === status ? "button button-primary" : "button"} key={item} onClick={() => { setStatus(item); setSelectedAdaptation(null); }} type="button">{item}</button>)}</div>
          </div>
          <DataTable columns={["Trigger", "Risk", "Updated", "Status", ""]} rows={adaptations.map((adaptation) => [
            adaptation.trigger ?? adaptation.adaptationId,
            <StatusBadge key={`${adaptation.adaptationId}:risk`} value={adaptation.riskLevel ?? "low"} />,
            formatRuntimeTimestamp(adaptation.updatedAt),
            <StatusBadge key={`${adaptation.adaptationId}:status`} value={adaptation.status ?? "proposed"} />,
            <button className="automation-runtime-row-action" key={`${adaptation.adaptationId}:open`} onClick={() => openAdaptation(adaptation.adaptationId)} type="button">Open</button>
          ])} empty={flowId ? "No adaptations in this status." : "Select a Flow to review adaptations."} />
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>Adaptation Detail</strong><span>{loadingDetail ? "Loading..." : selectedAdaptation?.adaptationId ?? "No adaptation selected"}</span></div>
            {selectedAdaptation ? <StatusBadge value={selectedAdaptation.status ?? "proposed"} /> : null}
          </header>
          {selectedAdaptation ? <>
            <SummaryStrip items={[
              ["Risk", selectedAdaptation.riskLevel ?? "-"],
              ["Author", selectedAdaptation.author ?? "-"],
              ["Validations", selectedAdaptation.validationResults?.length ?? 0],
              ["Confidence", selectedAdaptation.metadata?.confidenceScore ?? "-"]
            ]} />
            <DataTable columns={["Field", "Value"]} rows={[
              ["Trigger", selectedAdaptation.trigger ?? "-"],
              ["Diagnosis", selectedAdaptation.diagnosis ?? "-"],
              ["Source Run", selectedAdaptation.sourceRunId ?? "-"],
              ["Proposal", selectedAdaptation.proposalId ?? "-"]
            ]} empty="No detail." />
            <section className="automation-runtime-log-section">
              <header><strong>Patch Diff</strong><span>{selectedAdaptation.patch?.length ?? 0} patches</span></header>
              <DataTable columns={["Kind", "Target", "Summary", "Before", "After"]} rows={(selectedAdaptation.patch ?? []).map((patch: any, index: number) => [
                patch.kind ?? "-",
                patch.targetId ?? "-",
                patch.summary ?? "-",
                <JsonToggle key={`${index}:before`} label="Before JSON" value={patch.before ?? {}} />,
                <JsonToggle key={`${index}:after`} label="After JSON" value={patch.after ?? {}} />
              ])} empty="No patches." />
            </section>
            <section className="automation-runtime-log-section">
              <header><strong>Review Actions</strong><span>PIN required</span></header>
              <div className="automation-runtime-json-actions">
                {["approve", "reject", "apply", "disable", "revert", "supersede", "request_validation", "switch_manual"].map((action) => <button className="button" key={action} onClick={() => reviewAdaptation(action)} type="button">{action.replace(/_/g, " ")}</button>)}
              </div>
            </section>
            <JsonToggle label="Show Adaptation JSON" value={selectedAdaptation} />
          </> : <p className="automation-runtime-empty">Select an adaptation to inspect its evidence, patch, validations, and promotion controls.</p>}
        </section>
      </div>
    </section>
  );
}

export function AutomationTrainingStatusPanel(props: { status: { mode: string; runsCompleted: number; stabilityScore: number; learnedChangeCount: number; pendingProposalCount: number; uncertainty: any[]; frozenScopeCount: number } }) {
  const status = props.status;
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Training Status</strong><span>{status.mode}</span></header>
      <SummaryStrip items={[
        ["Runs", status.runsCompleted],
        ["Stability", `${Math.round(status.stabilityScore * 100)}%`],
        ["Learned", status.learnedChangeCount],
        ["Pending", status.pendingProposalCount],
        ["Uncertainty", status.uncertainty.length],
        ["Frozen", status.frozenScopeCount]
      ]} />
    </section>
  );
}

function RuntimeDebugInnerView(props: { projectId: string | null; initialSessions: any[] }) {
  const api = useProgramApi("automation-studio");
  const [view, setView] = useState<"list" | "log">("list");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>(() => sortRuntimeRunsForDebugView(props.initialSessions));
  const [page, setPage] = useState({ limit: RUNTIME_RUN_PAGE_SIZE, offset: 0, total: props.initialSessions.length });
  const [selectedRunDetail, setSelectedRunDetail] = useState<any | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setRuns(sortRuntimeRunsForDebugView(props.initialSessions));
    setPage((current) => ({ ...current, offset: 0, total: Math.max(current.total, props.initialSessions.length) }));
  }, [props.initialSessions]);
  useEffect(() => {
    if (!props.projectId) return;
    void loadRuns(0);
  }, [props.projectId]);
  const loadRuns = async (offset: number) => {
    if (!props.projectId) return;
    setLoadingRuns(true);
    setError("");
    const result = await api.post<{ runtimeSessions?: any[]; page?: { runs?: any[]; total?: number; limit?: number; offset?: number } }>("list-runtime-sessions", { projectId: props.projectId, summaries: true, limit: RUNTIME_RUN_PAGE_SIZE, offset });
    setLoadingRuns(false);
    if (!result.ok) {
      setError(result.error ?? "Runtime runs could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    setRuns(sortRuntimeRunsForDebugView(result.payload?.runtimeSessions ?? resultPage?.runs ?? []));
    setPage({
      limit: resultPage?.limit ?? RUNTIME_RUN_PAGE_SIZE,
      offset: resultPage?.offset ?? offset,
      total: resultPage?.total ?? result.payload?.runtimeSessions?.length ?? 0
    });
  };
  const openLog = async (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRunDetail(null);
    setView("log");
    if (!props.projectId) return;
    setLoadingLog(true);
    setError("");
    const result = await api.post<{ runDetail?: any }>("get-flow-run-detail", { projectId: props.projectId, runId });
    setLoadingLog(false);
    if (!result.ok || !result.payload?.runDetail) {
      setError(result.error ?? "Runtime log could not be loaded.");
      return;
    }
    setSelectedRunDetail(result.payload.runDetail);
  };
  const closeLog = () => {
    setView("list");
    setSelectedRunId(null);
    setSelectedRunDetail(null);
  };
  return (
    <section className="automation-runtime-debugger">
      {view === "list"
        ? <RuntimeRunListPage error={error} loading={loadingRuns} page={page} sessions={runs} onOpenLog={openLog} onPage={loadRuns} />
        : <RuntimeActionLogPage error={error} loading={loadingLog} runId={selectedRunId} runDetail={selectedRunDetail} onBack={closeLog} />}
    </section>
  );
}

export function routerReferencesForSubflow(router: any | null, subflowId: string): Array<{ id: string; name: string; status: string; order: string | number; condition: string }> {
  if (!router || !subflowId) return [];
  const rules = (router.rules ?? [])
    .filter((rule: any) => rule?.target?.kind === "subflow" && rule.target.subflowId === subflowId)
    .map((rule: any) => ({
      id: rule.ruleId ?? rule.name,
      name: rule.name ?? rule.ruleId ?? "Route rule",
      status: rule.status ?? "active",
      order: rule.order ?? "-",
      condition: rule.condition ? compactConditionLabel(rule.condition) : "Always"
    }));
  const fallback = router.fallback?.kind === "subflow" && router.fallback.subflowId === subflowId
    ? [{ id: `${router.routerId}:fallback`, name: "Fallback", status: router.status ?? "active", order: "fallback", condition: "No rule matched" }]
    : [];
  return [...rules, ...fallback];
}

export function runtimeAttemptsForRunDetail(runDetail: any | null): any[] {
  if (!runDetail) return [];
  if (Array.isArray(runDetail.actionAttempts)) return runDetail.actionAttempts;
  if (Array.isArray(runDetail.trace?.attempts)) return runDetail.trace.attempts;
  return [];
}

export function sortRuntimeRunsForDebugView(runs: any[]): any[] {
  return [...runs].sort((left, right) => runtimeRunSortTime(right) - runtimeRunSortTime(left) || String(right.runId ?? "").localeCompare(String(left.runId ?? "")));
}

function runtimeRunSortTime(run: any): number {
  return firstFiniteRuntimeNumber(run?.updatedAt, run?.updatedAtMs, run?.finishedAt, run?.startedAt, run?.queuedAt) ?? 0;
}

function firstFiniteRuntimeNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function compactConditionLabel(condition: any): string {
  if (!condition) return "Always";
  if (condition.signalPath) return `${condition.signalPath} ${condition.operator ?? "matches"}${condition.expected !== undefined ? ` ${String(condition.expected)}` : ""}`;
  if (condition.type && Array.isArray(condition.conditions)) return `${condition.type} (${condition.conditions.length})`;
  return "Condition";
}

function routerFallbackLabel(router: any | null): string {
  if (!router?.fallback) return "-";
  if (router.fallback.kind === "fail") return router.fallback.message ?? "Fail";
  if (router.fallback.kind === "subflow") return `Subflow ${router.fallback.subflowId}`;
  return "Fallback";
}

function instructionDraftFromInstruction(instruction: any | null) {
  return {
    instructionId: instruction?.instructionId ?? "",
    title: instruction?.title ?? "",
    body: instruction?.body ?? "",
    scopeKind: instruction?.scope?.kind ?? "flow",
    priority: Number.isFinite(Number(instruction?.priority)) ? Number(instruction.priority) : 50,
    requirement: instruction?.requirement === "required" ? "required" : "advisory",
    status: instruction?.status === "disabled" || instruction?.status === "archived" ? instruction.status : "active"
  };
}

function instructionDiagnostics(instructions: any[]): Array<{ code: string; message: string }> {
  const required = instructions.filter((instruction) => instruction.requirement === "required");
  const hasAlways = required.some((instruction) => /\balways\b/i.test(instruction.body ?? ""));
  const hasNever = required.some((instruction) => /\bnever\b/i.test(instruction.body ?? ""));
  return hasAlways && hasNever
    ? [{ code: "instruction.conflict", message: "Required instructions contain both always and never directives." }]
    : [];
}

function RuntimeRunListPage(props: { sessions: any[]; page: { limit: number; offset: number; total: number }; loading: boolean; error: string; onOpenLog(runId: string): void; onPage(offset: number): void }) {
  const nextOffset = props.page.offset + props.page.limit;
  const previousOffset = Math.max(0, props.page.offset - props.page.limit);
  const rangeStart = props.page.total ? props.page.offset + 1 : 0;
  const rangeEnd = Math.min(props.page.total, props.page.offset + props.sessions.length);
  return (
    <section className="automation-runtime-list-page">
      <header>
        <div>
          <strong>Previous Runs</strong>
          <span>{props.loading ? "Loading runs..." : `${rangeStart}-${rangeEnd} of ${props.page.total} runs`}</span>
        </div>
      </header>
      {props.error ? <p className="automation-runtime-message">{props.error}</p> : null}
      <div className="automation-runtime-run-list">
        {props.sessions.map((session) => (
          <article className="automation-runtime-run-row" key={session.runId ?? `${session.targetId}:${session.queuedAt}`}>
            <strong title={session.runId ?? "Run"}>{session.runId ?? "Run"}</strong>
            <span title={`${session.targetKind ?? "flow"}:${session.targetId ?? session.flowId ?? "-"}`}>{session.targetKind ?? "flow"}:{session.targetId ?? session.flowId ?? "-"}</span>
            <StatusBadge value={session.status ?? "queued"} />
            <span>{formatRuntimeTimestamp(session.startedAt ?? session.queuedAt)}</span>
            <span>{formatRuntimeDuration(session.startedAt, session.finishedAt)}</span>
            <span>{session.attemptCount ?? session.trace?.attempts?.length ?? 0} actions</span>
            <span>{session.effectCount ?? session.trace?.effects?.length ?? 0} effects</span>
            <button className="automation-runtime-row-action" onClick={() => props.onOpenLog(session.runId)} type="button">View Log</button>
          </article>
        ))}
        {!props.sessions.length ? <p className="automation-runtime-empty">No runtime sessions have been started for this project.</p> : null}
      </div>
      <footer className="automation-runtime-pagination-footer">
        <span>{props.loading ? "Loading..." : `${rangeStart}-${rangeEnd} of ${props.page.total}`}</span>
        <div className="automation-runtime-pagination">
          <button disabled={props.loading || props.page.offset <= 0} onClick={() => props.onPage(previousOffset)} type="button">Previous</button>
          <button disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onPage(nextOffset)} type="button">Next</button>
        </div>
      </footer>
    </section>
  );
}

function RuntimeActionLogPage(props: { runId: string | null; runDetail: any | null; loading: boolean; error: string; onBack(): void }) {
  const [attemptOffset, setAttemptOffset] = useState(0);
  const runDetail = props.runDetail;
  const summary = runDetail?.summary ?? {};
  const trace = runDetail?.trace;
  const attempts = runtimeAttemptsForRunDetail(runDetail);
  const recoveryAttempts = runDetail?.recoveryAttempts ?? [];
  const nextAttemptOffset = attemptOffset + RUNTIME_ACTION_PAGE_SIZE;
  const visibleAttempts = attempts.slice(attemptOffset, nextAttemptOffset);
  useEffect(() => {
    setAttemptOffset(0);
  }, [props.runId]);
  if (!runDetail) {
    return (
      <section className="automation-runtime-log-page">
        <header><button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button><div><strong>Action Log</strong><span>{props.loading ? `Loading ${props.runId ?? "run"}...` : props.error || "Run not found."}</span></div></header>
      </section>
    );
  }
  return (
    <section className="automation-runtime-log-page">
      <header>
        <button className="automation-runtime-back" onClick={props.onBack} type="button">Back</button>
        <div>
          <strong>Action Log</strong>
          <span>{summary.runId ?? props.runId} | flow:{summary.flowId ?? "-"} | {attempts.length} actions | {formatRuntimeDuration(summary.startedAt, summary.finishedAt)}</span>
        </div>
        <StatusBadge value={summary.status ?? trace?.status ?? "queued"} />
      </header>
      {runDetail?.metadata?.terminalFailureReason ? <p className="automation-runtime-message">{runDetail.metadata.terminalFailureReason}</p> : null}
      {runDetail?.metadata?.message ? <p className="automation-runtime-message">{runDetail.metadata.message}</p> : null}
      <div className="automation-runtime-log-toolbar">
        <span>{attempts.length ? `${attemptOffset + 1}-${Math.min(attempts.length, nextAttemptOffset)} of ${attempts.length} actions` : "No actions"}</span>
        <div>
          <button disabled={attemptOffset <= 0} onClick={() => setAttemptOffset(Math.max(0, attemptOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button>
          <button disabled={nextAttemptOffset >= attempts.length} onClick={() => setAttemptOffset(nextAttemptOffset)} type="button">Next</button>
        </div>
      </div>
      <ol className="automation-runtime-action-log">
        {visibleAttempts.map((attempt: any, index: number) => (
          <li key={runtimeAttemptKey(attempt, attemptOffset + index)}>
            <RuntimeAttemptRow attempt={attempt} index={attemptOffset + index} />
          </li>
        ))}
      </ol>
      {!attempts.length ? <p className="automation-runtime-empty">No node attempts were recorded for this run.</p> : null}
      <section className="automation-runtime-log-section">
        <header><strong>Recovery Ladder</strong><span>{recoveryAttempts.length} attempts</span></header>
        <DataTable columns={["Attempt", "Selected", "Target", "Status", "Reason", "Details"]} rows={recoveryAttempts.map((attempt: any) => [
          attempt.attemptId ?? "-",
          attempt.selectedKind ?? "-",
          attempt.selectedTargetNodeId ?? attempt.selectedEdgeId ?? "-",
          <StatusBadge key={`${attempt.recoveryId}:status`} value={attempt.status ?? "unknown"} />,
          attempt.reason ?? "-",
          <JsonToggle key={`${attempt.recoveryId}:json`} label="Show Recovery JSON" value={attempt} />
        ])} empty="No recovery or reroute decisions were recorded." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Runtime Effects</strong><span>{trace?.effects?.length ?? 0} effects</span></header>
        <DataTable columns={["#", "Node", "Type", "Payload"]} rows={(trace?.effects ?? []).slice(0, RUNTIME_ACTION_PAGE_SIZE).map((effect: any, index: number) => [index + 1, effect.nodeId ?? "-", effect.type ?? "-", <JsonToggle key={index} label="Show Payload JSON" value={effect.payload ?? {}} />])} empty="No runtime effects were dispatched." />
      </section>
      <section className="automation-runtime-log-section">
        <header><strong>Final Runtime Values</strong><span>{Object.keys(trace?.values ?? {}).length} keys</span></header>
        <JsonToggle label="Show Final Values JSON" value={trace?.values ?? {}} />
      </section>
    </section>
  );
}

export function RuntimeAttemptRow(props: { attempt: any; index: number }) {
  const attempt = props.attempt;
  const comparisonStatus = attempt.comparisonStatus ?? attempt.transitionComparison?.status;
  const recoverySelected = attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected;
  return (
    <article className="automation-runtime-attempt-row">
      <span className="automation-runtime-attempt-index">#{props.index + 1}</span>
      <strong title={attempt.nodeId}>{attempt.nodeId ?? "-"}</strong>
      <StatusBadge value={attempt.status ?? "unknown"} />
      <span title={attempt.definitionId ?? ""}>{attempt.definitionId ?? "-"}</span>
      <span>{attempt.route ?? "-"}</span>
      <span>{formatRuntimeTimestamp(attempt.startedAt)} | {formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)}</span>
      <span>{attempt.regionId ?? "-"}</span>
      <span>{comparisonStatus ? <StatusBadge value={comparisonStatus} /> : "-"}</span>
      <span>{recoverySelected ? `${recoverySelected.kind ?? "-"}${recoverySelected.targetNodeId ? ` -> ${recoverySelected.targetNodeId}` : ""}` : "-"}</span>
      <span title={attempt.message ?? ""}>{attempt.message ?? attempt.policyDecision?.reason ?? (attempt.compositeTarget ? `${attempt.compositeTarget.flowId}@${attempt.compositeTarget.version}` : "-")}</span>
      <JsonToggle label="Details JSON" value={runtimeAttemptDetailsJson(attempt, recoverySelected)} />
    </article>
  );
}

function runtimeAttemptDetailsJson(attempt: any, recoverySelected: any) {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    route: attempt.route,
    regionId: attempt.regionId,
    timing: { startedAt: attempt.startedAt, finishedAt: attempt.finishedAt },
    message: attempt.message,
    inputs: attempt.inputs ?? {},
    outputs: attempt.outputs ?? {},
    effects: attempt.effects ?? [],
    transitionComparison: attempt.transitionComparison,
    diffSummary: attempt.metadata?.diffSummary,
    recoverySelected,
    logs: attempt.logs ?? [],
    childTrace: attempt.childTrace,
    policyDecision: attempt.policyDecision,
    compositeTarget: attempt.compositeTarget,
    metadata: attempt.metadata ?? {}
  };
}

function JsonToggle(props: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="automation-runtime-json-toggle">
      <button onClick={() => setOpen((current) => !current)} type="button">{open ? "Hide" : props.label}</button>
      {open ? <JsonPreview value={props.value} /> : null}
    </div>
  );
}

function JsonPreview(props: { value: unknown }) {
  return <pre className="automation-runtime-json">{safeJson(props.value)}</pre>;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatRuntimeTimestamp(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toLocaleString() : "-";
}

function formatRuntimeDuration(startedAt: unknown, finishedAt: unknown): string {
  if (typeof startedAt !== "number" || typeof finishedAt !== "number") return "in progress";
  return `${Math.max(0, finishedAt - startedAt)}ms`;
}

function runtimeAttemptKey(attempt: any, index: number): string {
  return attempt.attemptId ?? `${attempt.nodeId}:${index}`;
}
