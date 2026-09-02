"use client";

import { Combobox, Field, Modal, StatusText } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Plus, Search, Workflow } from "lucide-react";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";

const WORKBENCH_PAGE_SIZE = 25;

import { readInstructionDirectoryUrlState, type InstructionDirectoryState } from "./instruction-directory-model";
import { effectiveInstructionOrder, emptyInstructionDraft, estimateInstructionTokens, instructionDiagnostics, instructionDraftFromInstruction, instructionDraftIsDirty, instructionImportance, instructionScopeTargetError, INSTRUCTION_TEMPLATES, type InstructionDraft } from "./instruction-model";
import { instructionDraftStorageKey, readStoredInstructionDraft, removeStoredInstructionDraft, saveStoredInstructionDraft } from "./instruction-draft-repository";
import { useInstructionCommands, type InstructionCommands } from "./instruction-host";
import { EffectiveInstructionsPanel, InstructionEditorPanel, InstructionLibraryPanel, type InstructionSaveState } from "./InstructionWorkbenchPanels";
import { useDirtyViewRegistration } from "../workspace/DirtyViewGuard";
import { automationStudioViewId } from "../views/view-registry";

export type InstructionsViewProps = { projectId: string | null; flow: any };

export function InstructionsView(props: InstructionsViewProps) {
  const commands = useInstructionCommands();
  return <InstructionsViewContent {...props} commands={commands} />;
}

export function InstructionsViewContent(props: InstructionsViewProps & { commands: InstructionCommands }) {
  const flowId = props.flow?.flowId;
  const initialState = useMemo(() => readInstructionDirectoryUrlState(), []);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: initialState.limit, offset: initialState.offset, total: 0 });
  const [queryInput, setQueryInput] = useState(initialState.search);
  const [filters, setFilters] = useState({ search: initialState.search, status: initialState.status, scopeKind: initialState.scopeKind, requirement: initialState.requirement, sort: initialState.sort, direction: initialState.direction });
  const [selectedInstruction, setSelectedInstruction] = useState<any | null>(null);
  const [draftInstruction, setDraftInstruction] = useState<InstructionDraft>(() => emptyInstructionDraft());
  const [baseInstructionDraft, setBaseInstructionDraft] = useState<InstructionDraft>(() => emptyInstructionDraft());
  const [recoveryDraft, setRecoveryDraft] = useState<InstructionDraft | null>(null);
  const [pendingEditorTarget, setPendingEditorTarget] = useState<null | { kind: "new" | "open" | "view"; instructionId?: string; view?: "library" | "editor" | "effective" }>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scopeRouter, setScopeRouter] = useState<any | null>(null);
  const [scopeSubflows, setScopeSubflows] = useState<any[]>([]);
  const [scopeTargetsLoading, setScopeTargetsLoading] = useState(false);
  const [scopeTargetsError, setScopeTargetsError] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showAdvancedPriority, setShowAdvancedPriority] = useState(false);
  const [instructionView, setInstructionView] = useState<"library" | "editor" | "effective">("library");
  const [effectiveInstructions, setEffectiveInstructions] = useState<any[]>([]);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [effectiveError, setEffectiveError] = useState("");
  const [saveState, setSaveState] = useState<InstructionSaveState>("saved");
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const scopeRequestRef = useRef(0);
  const effectiveRequestRef = useRef(0);
  const draftDirty = instructionDraftIsDirty(draftInstruction, baseInstructionDraft);
  const draftKey = props.projectId && flowId ? instructionDraftStorageKey(props.projectId, flowId, selectedInstruction?.instructionId) : "";
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: queryInput.trim() })), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);
  useEffect(() => {
    setSelectedInstruction(null);
    const blank = emptyInstructionDraft();
    setDraftInstruction(blank);
    setBaseInstructionDraft(blank);
    setRecoveryDraft(props.projectId && flowId ? readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId)) : null);
    setInstructions([]);
    setScopeRouter(null);
    setScopeSubflows([]);
    setScopeTargetsError("");
    setEffectiveInstructions([]);
    setEffectiveError("");
    setInstructionView("library");
    if (!props.projectId || !flowId) setPage((current) => ({ ...current, offset: 0, total: 0 }));
  }, [props.projectId, flowId]);
  useEffect(() => {
    if (props.projectId && flowId) void loadInstructions(page.offset);
  }, [props.projectId, flowId, filters.search, filters.status, filters.scopeKind, filters.requirement, filters.sort, filters.direction, page.limit]);
  useEffect(() => {
    if (instructionView === "effective" && props.projectId && flowId && !effectiveInstructions.length && !effectiveLoading) { void loadEffectiveInstructions(); if (!scopeSubflows.length) void loadInstructionScopeTargets("subflows"); }
  }, [instructionView, props.projectId, flowId]);  useEffect(() => {
    if (!props.projectId || !flowId) return;
    if (draftInstruction.scopeKind === "router" && !scopeRouter) void loadInstructionScopeTargets("router");
    if (["subflow", "on_error", "adaptation_review"].includes(draftInstruction.scopeKind) && !scopeSubflows.length) void loadInstructionScopeTargets("subflows");
  }, [props.projectId, flowId, draftInstruction.scopeKind]);  useEffect(() => {
    if (draftInstruction.scopeKind === "router" && scopeRouter?.routerId && !draftInstruction.routerId) {
      setDraftInstruction((current) => ({ ...current, routerId: scopeRouter.routerId }));
    }
  }, [draftInstruction.scopeKind, draftInstruction.routerId, scopeRouter?.routerId]);  useEffect(() => {
    if (!draftKey || !draftDirty) return;
    const timer = window.setTimeout(() => saveStoredInstructionDraft(draftKey, draftInstruction), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftDirty, draftInstruction]);
  useEffect(() => {
    setSaveState(draftDirty ? "unsaved" : "saved");
  }, [draftDirty]);  const loadInstructionScopeTargets = async (kind: "router" | "subflows") => {
    if (!props.projectId || !flowId) return;
    const requestId = ++scopeRequestRef.current;
    setScopeTargetsLoading(true);
    setScopeTargetsError("");
    const result = kind === "router"
      ? await props.commands.loadScopeRouter({ projectId: props.projectId, flowId })
      : await props.commands.listScopeSubflows({ projectId: props.projectId, flowId, limit: 100, offset: 0, sort: "name", direction: "asc" });
    if (requestId !== scopeRequestRef.current) return;
    setScopeTargetsLoading(false);
    if (!result.ok) { setScopeTargetsError(result.error ?? "Instruction targets could not be loaded."); return; }
    if (kind === "router") setScopeRouter((result.payload as any)?.router ?? null);
    else setScopeSubflows((result.payload as any)?.subflows ?? (result.payload as any)?.page?.subflows ?? []);
  };  const loadEffectiveInstructions = async () => {
    if (!props.projectId || !flowId) return;
    const requestId = ++effectiveRequestRef.current;
    setEffectiveLoading(true);
    setEffectiveError("");
    const result = await props.commands.loadEffectiveSet({ projectId: props.projectId, flowId });
    if (requestId !== effectiveRequestRef.current) return;
    setEffectiveLoading(false);
    if (!result.ok) { setEffectiveError(result.error ?? "Effective instructions could not be loaded."); return; }
    setEffectiveInstructions(effectiveInstructionOrder(result.payload?.instructions ?? []));
  };

  const loadInstructions = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    const result = await props.commands.listInstructions({ projectId: props.projectId, flowId, limit: page.limit, offset, ...filters });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok) { setError(result.error ?? "Instructions could not be loaded."); return; }
    const resultPage = result.payload?.page;
    const items = result.payload?.instructions ?? resultPage?.instructions ?? [];
    const total = resultPage?.total ?? items.length;
    const safeOffset = total > 0 && offset >= total ? Math.max(0, Math.floor((total - 1) / page.limit) * page.limit) : offset;
    if (safeOffset !== offset) { void loadInstructions(safeOffset); return; }
    setInstructions(items);
    setPage((current) => ({ limit: resultPage?.limit ?? current.limit, offset: resultPage?.offset ?? offset, total }));

  };
  const openInstructionSet = async (instructionId: string) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    const result = await props.commands.loadInstruction({ projectId: props.projectId, instructionId });
    if (requestId !== detailRequestRef.current) return;
    setDetailLoading(false);
    if (!result.ok || !result.payload?.instruction) { setError(result.error ?? "Instruction detail could not be loaded."); return; }
    const nextDraft = instructionDraftFromInstruction(result.payload.instruction);
    setSelectedInstruction(result.payload.instruction);
    setBaseInstructionDraft(nextDraft);
    setDraftInstruction(nextDraft);
    const stored = readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId, instructionId));
    setRecoveryDraft(stored && instructionDraftIsDirty(stored, nextDraft) ? stored : null);
    setInstructionView("editor");
  };
  const openNewInstruction = () => {
    const blank = emptyInstructionDraft();
    setSelectedInstruction(null);
    setBaseInstructionDraft(blank);
    setDraftInstruction(blank);
    setRecoveryDraft(props.projectId && flowId ? readStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId)) : null);
    setInstructionView("editor");
  };
  const requestInstructionOpen = (instructionId: string) => draftDirty ? setPendingEditorTarget({ kind: "open", instructionId }) : void openInstructionSet(instructionId);
  const requestCreateInstruction = () => draftDirty ? setPendingEditorTarget({ kind: "new" }) : openNewInstruction();
  const requestInstructionView = (view: "library" | "editor" | "effective") => instructionView === "editor" && view !== "editor" && draftDirty ? setPendingEditorTarget({ kind: "view", view }) : setInstructionView(view);
  const discardAndContinue = () => {
    if (draftKey) removeStoredInstructionDraft(draftKey);
    const target = pendingEditorTarget;
    setPendingEditorTarget(null);
    if (target?.kind === "open" && target.instructionId) void openInstructionSet(target.instructionId);
    else if (target?.kind === "new") openNewInstruction();
    else if (target?.kind === "view" && target.view) setInstructionView(target.view);
  };
  const requestSaveInstruction = () => {
    setSaveAuthorizationPin("");
    setSaveAuthorizationError("");
    setSaveAuthorizationOpen(true);
  };
  const discardInstructionChanges = () => {
    if (draftKey) removeStoredInstructionDraft(draftKey);
    setDraftInstruction(baseInstructionDraft);
    setRecoveryDraft(null);
    setSaveState("saved");
  };
  useDirtyViewRegistration({
    id: `instructions:${props.projectId ?? "none"}:${flowId ?? "none"}`,
    viewId: automationStudioViewId.instructions,
    label: selectedInstruction?.title ? `Instruction: ${selectedInstruction.title}` : "New instruction",
    dirty: draftDirty,
    save: requestSaveInstruction,
    discard: discardInstructionChanges
  });
  const saveInstruction = async (authorizationPin: string) => {
    if (!props.projectId || !flowId || authorizationPin.trim().length < 4) return;
    setError("");
    setSaveAuthorizationError("");
    setSaveState("saving");
    const result = await props.commands.saveInstruction({
      projectId: props.projectId,
      flowId,
      authorizationPin: authorizationPin.trim(),
      ...(draftInstruction.instructionId ? { instructionId: draftInstruction.instructionId } : {}),
      title: draftInstruction.title,
      body: draftInstruction.body,
      scopeKind: draftInstruction.scopeKind,
      ...(draftInstruction.routerId ? { routerId: draftInstruction.routerId } : {}),
      ...(draftInstruction.subflowId ? { subflowId: draftInstruction.subflowId } : {}),
      ...(draftInstruction.nodeId ? { nodeId: draftInstruction.nodeId } : {}),
      priority: draftInstruction.priority,
      requirement: draftInstruction.requirement,
      status: draftInstruction.status
    });
    if (!result.ok || !result.payload?.instruction) {
      const message = result.error ?? "Instruction could not be saved.";
      setError(message);
      setSaveAuthorizationError(message);
      setSaveState("failed");
      return;
    }
    const savedDraft = instructionDraftFromInstruction(result.payload.instruction);
    if (draftKey) removeStoredInstructionDraft(draftKey);
    if (props.projectId && flowId) removeStoredInstructionDraft(instructionDraftStorageKey(props.projectId, flowId));
    setSelectedInstruction(result.payload.instruction);
    setBaseInstructionDraft(savedDraft);
    setDraftInstruction(savedDraft);
    setRecoveryDraft(null);
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    setSaveState("saved");
    setEffectiveInstructions([]);
    commitAutomationStudioMutation({
      kind: "instruction.changed",
      projectId: props.projectId,
      flowId,
      instructionId: result.payload.instruction.instructionId
    });
    await loadInstructions(page.offset);
  };  const draftDiagnosticInstruction = { instructionId: draftInstruction.instructionId || "new-instruction", title: draftInstruction.title, body: draftInstruction.body, priority: draftInstruction.priority, requirement: draftInstruction.requirement, status: draftInstruction.status, scope: { kind: draftInstruction.scopeKind, routerId: draftInstruction.routerId, subflowId: draftInstruction.subflowId, nodeId: draftInstruction.nodeId } };
  const diagnostics = instructionDiagnostics([draftDiagnosticInstruction]);
  const effectiveDiagnostics = instructionDiagnostics(effectiveInstructions);
  const draftTokenEstimate = estimateInstructionTokens(draftDiagnosticInstruction);
  const effectiveTokenEstimate = effectiveInstructions.reduce((total, instruction) => total + estimateInstructionTokens(instruction), 0);
  const nextOffset = page.offset + page.limit;
  const lastOffset = page.total ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
  const filtered = Boolean(filters.search || filters.status || filters.scopeKind || filters.requirement);
  const scopeTargetError = instructionScopeTargetError(draftInstruction);
  const currentImportance = instructionImportance(draftInstruction.priority);
  const applyInstructionTemplate = () => {
    const template = INSTRUCTION_TEMPLATES.find((candidate) => candidate.id === selectedTemplateId);
    if (!template) return;
    setDraftInstruction((current) => ({ ...current, title: template.title, body: template.body, scopeKind: template.scopeKind, priority: template.priority, requirement: template.requirement, routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" }));
    setShowAdvancedPriority(false);
  };
  const subflowOptions = scopeSubflows.map((subflow) => ({ value: String(subflow.subflowId), label: String(subflow.name ?? subflow.label ?? "Untitled subflow"), description: String(subflow.role ?? "Subflow") }));
  const nodeOptions = (Array.isArray(props.flow?.nodes) ? props.flow.nodes : []).map((node: any) => ({ value: String(node.id), label: String(node.label ?? node.name ?? node.metadata?.label ?? node.id), description: String(node.definitionId ?? node.type ?? "Node") }));
  const routerOptions = scopeRouter?.routerId ? [{ value: String(scopeRouter.routerId), label: String(scopeRouter.name ?? scopeRouter.label ?? "Flow Router"), description: "Router for this Flow" }] : [];
  const effectiveTargetLabel = (instruction: any) => {
    const scope = instruction?.scope ?? {};
    if (scope.nodeId) return nodeOptions.find((option: { value: string; label: string }) => option.value === scope.nodeId)?.label ?? "Selected node";
    if (scope.subflowId) return subflowOptions.find((option) => option.value === scope.subflowId)?.label ?? "Selected subflow";
    if (scope.routerId) return scopeRouter?.name ?? scopeRouter?.label ?? "Flow Router";
    return "Entire Flow";
  };  const changeInstructionScope = (scopeKind: string) => setDraftInstruction((current) => ({ ...current, scopeKind, routerId: scopeKind === "router" ? current.routerId : "", subflowId: "", nodeId: "", errorTargetKind: "flow" }));
  const scopeObjectPicker = draftInstruction.scopeKind === "router"
    ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} hint="The Router that decides which subflow receives a run." label="Applies to" onChange={(routerId) => setDraftInstruction((current) => ({ ...current, routerId }))} options={routerOptions} placeholder={scopeTargetsLoading ? "Loading Router" : "Choose Router"} value={draftInstruction.routerId} />
    : draftInstruction.scopeKind === "subflow"
      ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} hint="Search by subflow name; internal IDs are handled automatically." label="Applies to" onChange={(subflowId) => setDraftInstruction((current) => ({ ...current, subflowId }))} options={subflowOptions} placeholder={scopeTargetsLoading ? "Loading subflows" : "Search subflows"} value={draftInstruction.subflowId} />
      : draftInstruction.scopeKind === "node"
        ? <Combobox {...(scopeTargetError ? { error: scopeTargetError } : {})} hint="Nodes from the current Flow or subflow graph." label="Applies to" onChange={(nodeId) => setDraftInstruction((current) => ({ ...current, nodeId }))} options={nodeOptions} placeholder="Search nodes" value={draftInstruction.nodeId} />
        : ["on_error", "adaptation_review"].includes(draftInstruction.scopeKind)
          ? <div className="automation-instruction-target-stack"><label><span>Target level</span><select value={draftInstruction.errorTargetKind} onChange={(event) => setDraftInstruction((current) => ({ ...current, errorTargetKind: event.target.value as InstructionDraft["errorTargetKind"], subflowId: "", nodeId: "" }))}><option value="flow">Entire Flow</option><option value="subflow">Specific subflow</option>{draftInstruction.scopeKind === "on_error" ? <option value="node">Specific node</option> : null}</select></label>{draftInstruction.errorTargetKind === "subflow" ? <Combobox disabled={scopeTargetsLoading} {...(scopeTargetError || scopeTargetsError ? { error: scopeTargetError || scopeTargetsError } : {})} label="Applies to" onChange={(subflowId) => setDraftInstruction((current) => ({ ...current, subflowId }))} options={subflowOptions} placeholder={scopeTargetsLoading ? "Loading subflows" : "Search subflows"} value={draftInstruction.subflowId} /> : draftInstruction.errorTargetKind === "node" ? <Combobox {...(scopeTargetError ? { error: scopeTargetError } : {})} label="Applies to" onChange={(nodeId) => setDraftInstruction((current) => ({ ...current, nodeId }))} options={nodeOptions} placeholder="Search nodes" value={draftInstruction.nodeId} /> : <div className="automation-instruction-scope-summary"><Workflow size={16} aria-hidden /><div><strong>{props.flow?.name ?? "Current Flow"}</strong><span>No narrower object target</span></div></div>}</div>
          : <div className="automation-instruction-scope-summary"><Workflow size={16} aria-hidden /><div><strong>{draftInstruction.scopeKind === "global" ? "All projects and Flows" : draftInstruction.scopeKind === "project" ? "Current project" : props.flow?.name ?? "Current Flow"}</strong><span>{draftInstruction.scopeKind === "global" ? "Framework-wide guidance" : draftInstruction.scopeKind === "project" ? "Inherited by Flows in this project" : "Applies throughout this Flow"}</span></div></div>;
  return (<>
    <section className="automation-runs-workspace automation-instructions-shell">
      <header>
        <div><strong>Instructions</strong><span>Scoped guidance for generation, runtime, errors, and review</span></div>
        <button className="button button-primary" disabled={!props.projectId || !flowId} onClick={requestCreateInstruction} type="button"><Plus size={14} aria-hidden />New Instruction</button>
      </header>
      <nav aria-label="Instruction views" className="automation-instruction-view-tabs" role="tablist">{([ ["library", "Library"], ["editor", "Editor"], ["effective", "Effective Preview"] ] as const).map(([view, label]) => <button aria-selected={instructionView === view} className={instructionView === view ? "selected" : ""} key={view} onClick={() => requestInstructionView(view)} role="tab" type="button">{label}{view === "editor" && draftDirty ? <span aria-label="Unsaved changes" /> : null}</button>)}</nav>
      {!loading && page.total === 0 && flowId ? <div className="automation-instruction-readiness-banner" role="status"><AlertCircle size={17} aria-hidden /><div><strong>This Flow needs guidance before its first run</strong><span>Add at least one active instruction so the runtime and LLM know the intended outcome and constraints.</span></div><button className="button button-primary" onClick={requestCreateInstruction} type="button">Create Instruction</button><button className="button" onClick={() => { openNewInstruction(); setSelectedTemplateId("flow-goal"); }} type="button">Browse Templates</button></div> : null}
      {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void loadInstructions(page.offset)} type="button">Retry</button></div> : null}
      <div className="automation-instruction-library-toolbar" role="search">
        <label className="automation-subflow-search"><Search size={14} aria-hidden /><input aria-label="Search instructions" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search instructions" type="search" value={queryInput} /></label>
        <select aria-label="Filter instructions by scope" onChange={(event) => setFilters((current) => ({ ...current, scopeKind: event.target.value }))} value={filters.scopeKind}><option value="">All scopes</option><option value="global">Global</option><option value="project">Project</option><option value="flow">Flow</option><option value="router">Router</option><option value="subflow">Subflow</option><option value="node">Node</option><option value="on_error">On error</option><option value="adaptation_review">Adaptation review</option></select>
        <select aria-label="Filter instructions by status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select>
        <select aria-label="Filter instructions by requirement" onChange={(event) => setFilters((current) => ({ ...current, requirement: event.target.value }))} value={filters.requirement}><option value="">All requirements</option><option value="required">Required</option><option value="advisory">Advisory</option></select>
        <select aria-label="Sort instructions" onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as InstructionDirectoryState["sort"] }))} value={filters.sort}><option value="updated">Recently updated</option><option value="title">Title</option><option value="scope">Scope</option><option value="priority">Priority</option><option value="status">Status</option></select>
        <button aria-label={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} className="icon-button" onClick={() => setFilters((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} title={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} type="button">{filters.direction === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}</button>
      </div>
      <div className="automation-instructions-workspace">
        <InstructionLibraryPanel filtered={filtered} flowId={flowId} hidden={instructionView !== "library"} instructions={instructions} loading={loading} onLoad={(offset) => void loadInstructions(offset)} onOpen={requestInstructionOpen} page={page} selectedInstruction={selectedInstruction} setPage={setPage} />
        <InstructionEditorPanel applyTemplate={applyInstructionTemplate} changeScope={changeInstructionScope} currentImportance={currentImportance} detailLoading={detailLoading} diagnostics={diagnostics} discardChanges={discardInstructionChanges} draft={draftInstruction} draftDirty={draftDirty} draftTokenEstimate={draftTokenEstimate} flowId={flowId} hidden={instructionView !== "editor"} onSave={requestSaveInstruction} projectId={props.projectId} recoveryDraft={recoveryDraft} removeRecovery={() => { if (draftKey) removeStoredInstructionDraft(draftKey); setRecoveryDraft(null); }} saveState={saveState} scopeObjectPicker={scopeObjectPicker} scopeTargetError={scopeTargetError} selectedInstruction={selectedInstruction} selectedTemplateId={selectedTemplateId} setDraft={setDraftInstruction} setRecoveryDraft={setRecoveryDraft} setSelectedTemplateId={setSelectedTemplateId} setShowAdvancedPriority={setShowAdvancedPriority} showAdvancedPriority={showAdvancedPriority} />
        <EffectiveInstructionsPanel canLoad={Boolean(props.projectId && flowId)} diagnostics={effectiveDiagnostics} effectiveTargetLabel={effectiveTargetLabel} error={effectiveError} hidden={instructionView !== "effective"} instructions={effectiveInstructions} loading={effectiveLoading} onCreate={requestCreateInstruction} onRefresh={() => void loadEffectiveInstructions()} tokenEstimate={effectiveTokenEstimate} />
      </div>
    </section>
    {pendingEditorTarget ? <Modal title="Unsaved Instruction Changes" onClose={() => setPendingEditorTarget(null)}><div className="automation-modal-form"><p className="automation-router-modal-intro">This instruction has local changes that have not been saved.</p><div className="modal-actions"><button className="button" onClick={() => setPendingEditorTarget(null)} type="button">Keep Editing</button><button className="button danger" onClick={discardAndContinue} type="button">Discard and Continue</button></div></div></Modal> : null}
    {saveAuthorizationOpen ? <Modal title="Authorize Instruction Save" onClose={() => saveState === "saving" ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this write with your security PIN. Your instruction draft stays in this editor if authorization fails.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saveState === "saving"} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saveState === "saving"} onClick={() => void saveInstruction(saveAuthorizationPin)} type="button">{saveState === "saving" ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}
  </>);
}
