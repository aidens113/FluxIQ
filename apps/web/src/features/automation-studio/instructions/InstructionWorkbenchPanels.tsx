import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, ListChecks, Power } from "lucide-react";

import { StatusBadge, StatusText } from "../../programs/shared-ui";
import { JsonToggle } from "../runtime";
import { INSTRUCTION_TEMPLATES, instructionImportance, instructionPriorityForImportance, instructionScopeLabel, type InstructionDiagnostic, type InstructionDraft } from "./instruction-model";

export type InstructionSaveState = "saved" | "unsaved" | "saving" | "failed";
type InstructionPage = { limit: number; offset: number; total: number };

export function InstructionLibraryPanel(props: {
  filtered: boolean; flowId?: string; hidden: boolean; instructions: any[]; loading: boolean;
  onLoad: (offset: number) => void; onOpen: (instructionId: string) => void; page: InstructionPage;
  selectedInstruction: any | null; setPage: Dispatch<SetStateAction<InstructionPage>>;
}) {
  const nextOffset = props.page.offset + props.page.limit;
  const lastOffset = props.page.total ? Math.floor((props.page.total - 1) / props.page.limit) * props.page.limit : 0;
  const range = props.page.total ? String(props.page.offset + 1) + "-" + String(Math.min(props.page.total, props.page.offset + props.instructions.length)) + " of " + String(props.page.total) : "0 instructions";
  return <section className="automation-instruction-list-pane" hidden={props.hidden}>
    <header><div><strong>Instruction Library</strong><span>{range}</span></div></header>
    <div aria-busy={props.loading} className="automation-instruction-list">
      {props.instructions.map((instruction) => <button className={props.selectedInstruction?.instructionId === instruction.instructionId ? "selected" : ""} key={instruction.instructionId} onClick={() => props.onOpen(instruction.instructionId)} type="button">
        <span className="automation-instruction-title">{instruction.title ?? instruction.instructionId}</span>
        <span className="automation-instruction-meta">{instructionScopeLabel(instruction.scopeKind ?? instruction.scope?.kind)} | priority {instruction.priority ?? 0}</span>
        <span className="automation-instruction-footer"><StatusBadge value={instruction.status ?? "active"} /><small>{instruction.requirement ?? "advisory"}</small></span>
      </button>)}
      {props.loading && !props.instructions.length ? <div className="automation-router-loading" aria-label="Loading instructions"><span /><span /><span /></div> : null}
      {!props.loading && !props.instructions.length ? <div className="automation-subflow-directory-empty"><ListChecks size={22} aria-hidden /><strong>{props.flowId ? props.filtered ? "No matching instructions" : "No instructions yet" : "Select a Flow"}</strong><span>{props.flowId ? props.filtered ? "Adjust the search or filters to see other instructions." : "Create the first instruction to give this Flow usable guidance." : "Choose a Flow to review its instructions."}</span></div> : null}
    </div>
    <footer className="automation-instruction-library-footer">
      <span>{props.page.total ? range : "0 of 0"}</span>
      <label>Rows <select aria-label="Instructions per page" onChange={(event) => props.setPage((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))} value={props.page.limit}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
      <div><button className="icon-button" disabled={props.loading || props.page.offset <= 0} onClick={() => props.onLoad(0)} title="First page" aria-label="First instruction page" type="button"><ChevronsLeft size={14} aria-hidden /></button><button className="icon-button" disabled={props.loading || props.page.offset <= 0} onClick={() => props.onLoad(Math.max(0, props.page.offset - props.page.limit))} title="Previous page" aria-label="Previous instruction page" type="button"><ChevronLeft size={14} aria-hidden /></button><button className="icon-button" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onLoad(nextOffset)} title="Next page" aria-label="Next instruction page" type="button"><ChevronRight size={14} aria-hidden /></button><button className="icon-button" disabled={props.loading || nextOffset >= props.page.total} onClick={() => props.onLoad(lastOffset)} title="Last page" aria-label="Last instruction page" type="button"><ChevronsRight size={14} aria-hidden /></button></div>
    </footer>
  </section>;
}

export type InstructionEditorPanelProps = {
  applyTemplate: () => void; changeScope: (scopeKind: string) => void; currentImportance: ReturnType<typeof instructionImportance>;
  detailLoading: boolean; diagnostics: InstructionDiagnostic[]; discardChanges: () => void; draft: InstructionDraft;
  draftDirty: boolean; draftTokenEstimate: number; flowId?: string; hidden: boolean; onSave: () => void;
  projectId: string | null; recoveryDraft: InstructionDraft | null; removeRecovery: () => void; saveState: InstructionSaveState;
  scopeObjectPicker: ReactNode; scopeTargetError: string; selectedInstruction: any | null; selectedTemplateId: string;
  setDraft: Dispatch<SetStateAction<InstructionDraft>>; setRecoveryDraft: Dispatch<SetStateAction<InstructionDraft | null>>;
  setSelectedTemplateId: Dispatch<SetStateAction<string>>; setShowAdvancedPriority: Dispatch<SetStateAction<boolean>>;
  showAdvancedPriority: boolean;
};

export function InstructionEditorPanel(props: InstructionEditorPanelProps) {
  const draft = props.draft;
  return <section aria-busy={props.detailLoading} className="automation-instruction-editor-pane" hidden={props.hidden}>
    <header><div><strong>Instruction Editor</strong><span>{props.detailLoading ? "Loading instruction" : props.draftDirty ? "Unsaved changes" : props.selectedInstruction?.instructionId ?? "New instruction"}</span></div><InstructionSaveStatus state={props.saveState} compact /></header>
    {props.recoveryDraft ? <div className="automation-instruction-recovery" role="status"><div><strong>Recovered local draft</strong><span>A newer unsaved version is available for this instruction.</span></div><div><button className="button" onClick={props.removeRecovery} type="button">Discard</button><button className="button button-primary" onClick={() => { props.setDraft(props.recoveryDraft!); props.setRecoveryDraft(null); }} type="button">Restore</button></div></div> : null}
    <div className="automation-instruction-editor-sections">
      <section className="automation-instruction-editor-section automation-instruction-content-section">
        <header><div><strong>Content</strong><span>Name the guidance and write the instruction in plain language.</span></div></header>
        <div className="automation-instruction-template-bar"><label><span>Start from a template</span><select aria-label="Instruction template" onChange={(event) => props.setSelectedTemplateId(event.target.value)} value={props.selectedTemplateId}><option value="">Blank instruction</option>{INSTRUCTION_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label><button className="button" disabled={!props.selectedTemplateId} onClick={props.applyTemplate} type="button">Apply Template</button>{props.selectedTemplateId ? <span>{INSTRUCTION_TEMPLATES.find((template) => template.id === props.selectedTemplateId)?.description}</span> : null}</div>
        <label><span>Title</span><input value={draft.title} onChange={(event) => props.setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Instruction title" /></label>
        <label className="automation-instruction-body-field"><span>Instruction</span><textarea rows={12} value={draft.body} onChange={(event) => props.setDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Tell FluxIQ what to prefer, avoid, require, or clarify for this Flow." /><div className="automation-instruction-token-meter"><span>About {props.draftTokenEstimate} tokens</span><progress aria-label="Estimated instruction tokens" max={2000} value={Math.min(2000, props.draftTokenEstimate)} /></div></label>
      </section>
      <section className="automation-instruction-editor-section automation-instruction-behavior-section">
        <header><div><strong>Behavior</strong><span>Control where this guidance applies and how strongly it is enforced.</span></div></header>
        <div className="automation-instruction-behavior-grid">
          <div className="automation-instruction-scope-control"><label><span>Scope</span><select value={draft.scopeKind} onChange={(event) => props.changeScope(event.target.value)}><option value="global">Global</option><option value="project">Project</option><option value="flow">Flow</option><option value="router">Router</option><option value="subflow">Subflow</option><option value="node">Node</option><option value="on_error">On Error</option><option value="adaptation_review">Adaptation Review</option></select></label>{props.scopeObjectPicker}</div>
          <fieldset className="automation-instruction-choice-field"><legend>Requirement</legend><div className="automation-instruction-segments"><button aria-pressed={draft.requirement === "advisory"} className={draft.requirement === "advisory" ? "selected" : ""} onClick={() => props.setDraft((current) => ({ ...current, requirement: "advisory" }))} type="button">Advisory</button><button aria-pressed={draft.requirement === "required"} className={draft.requirement === "required" ? "selected" : ""} onClick={() => props.setDraft((current) => ({ ...current, requirement: "required" }))} type="button">Required</button></div><small>Required guidance is treated as a runtime constraint.</small></fieldset>
          <fieldset className="automation-instruction-choice-field"><legend>Status</legend><div className="automation-instruction-segments">{(["active", "disabled", "archived"] as const).map((status) => <button aria-pressed={draft.status === status} className={draft.status === status ? "selected" : ""} key={status} onClick={() => props.setDraft((current) => ({ ...current, status }))} type="button">{status.charAt(0).toUpperCase() + status.slice(1)}</button>)}</div></fieldset>
          <fieldset className="automation-instruction-choice-field automation-instruction-importance-field"><legend>Importance</legend><div className="automation-instruction-segments">{(["low", "normal", "high", "critical"] as const).map((importance) => <button aria-pressed={props.currentImportance === importance} className={props.currentImportance === importance ? "selected" : ""} key={importance} onClick={() => props.setDraft((current) => ({ ...current, priority: instructionPriorityForImportance(importance) }))} type="button">{importance.charAt(0).toUpperCase() + importance.slice(1)}</button>)}</div><button className="automation-instruction-advanced-toggle" onClick={() => props.setShowAdvancedPriority((current) => !current)} type="button">{props.showAdvancedPriority || props.currentImportance === "custom" ? "Hide numeric priority" : "Fine-tune priority"}</button>{props.showAdvancedPriority || props.currentImportance === "custom" ? <label><span>Numeric priority (0-100)</span><input min="0" max="100" type="number" value={draft.priority} onChange={(event) => props.setDraft((current) => ({ ...current, priority: Math.max(0, Math.min(100, Number(event.target.value))) }))} /></label> : null}</fieldset>
        </div>
      </section>
    </div>
    <section className="automation-instruction-diagnostics"><header><strong>Draft Checks</strong><span>{props.diagnostics.length ? String(props.diagnostics.length) + " issue" + (props.diagnostics.length === 1 ? "" : "s") : "Ready"}</span></header>{props.diagnostics.length ? props.diagnostics.map((diagnostic, index) => <article className={"severity-" + diagnostic.severity} key={diagnostic.code + "-" + String(index)}><div><strong>{diagnostic.title}</strong><StatusBadge value={diagnostic.severity} /></div><span>{diagnostic.message}</span>{diagnostic.instructionIds.length ? <small>{diagnostic.instructionIds.join(", ")}</small> : null}</article>) : <p>No conflicts, duplicates, or size warnings in this draft.</p>}</section>
    {props.selectedInstruction ? <JsonToggle label="Show Instruction JSON" value={props.selectedInstruction} /> : null}
    <footer className="automation-instruction-editor-footer"><InstructionSaveStatus state={props.saveState} /><div><button className="button" disabled={!props.draftDirty || props.saveState === "saving"} onClick={props.discardChanges} type="button">Discard Changes</button><button className="button button-primary" disabled={props.saveState === "saving" || !props.draftDirty || !props.projectId || !props.flowId || !draft.title.trim() || !draft.body.trim() || Boolean(props.scopeTargetError)} onClick={props.onSave} type="button">{props.saveState === "saving" ? "Saving..." : "Save Instruction"}</button></div></footer>
  </section>;
}

export function EffectiveInstructionsPanel(props: {
  canLoad: boolean; diagnostics: InstructionDiagnostic[]; effectiveTargetLabel: (instruction: any) => string;
  error: string; hidden: boolean; instructions: any[]; loading: boolean; onCreate: () => void;
  onRefresh: () => void; tokenEstimate: number;
}) {
  return <section aria-busy={props.loading} className="automation-instruction-effective-pane" hidden={props.hidden}>
    <header><div><strong>Effective Instructions</strong><span>{props.instructions.length} active instruction{props.instructions.length === 1 ? "" : "s"} in runtime order</span></div><button className="icon-button" disabled={props.loading || !props.canLoad} onClick={props.onRefresh} title="Refresh effective instructions" aria-label="Refresh effective instructions" type="button"><Power size={14} aria-hidden /></button></header>
    <div className="automation-instruction-effective-intro"><Info size={16} aria-hidden /><div><strong>How the runtime reads this guidance</strong><span>Broad inherited guidance is applied first. More specific instructions follow, with higher importance first inside each scope.</span></div></div>
    <div className="automation-instruction-effective-budget"><div><strong>Instruction context</strong><span>About {props.tokenEstimate} of 2,000 tokens</span></div><progress aria-label="Estimated effective instruction tokens" max={2000} value={Math.min(2000, props.tokenEstimate)} /></div>
    {props.diagnostics.length ? <section className="automation-instruction-diagnostics automation-instruction-effective-diagnostics"><header><strong>Effective Set Checks</strong><span>{props.diagnostics.length} issue{props.diagnostics.length === 1 ? "" : "s"}</span></header>{props.diagnostics.map((diagnostic, index) => <article className={"severity-" + diagnostic.severity} key={diagnostic.code + "-" + String(index)}><div><strong>{diagnostic.title}</strong><StatusBadge value={diagnostic.severity} /></div><span>{diagnostic.message}</span>{diagnostic.instructionIds.length ? <small>{diagnostic.instructionIds.join(", ")}</small> : null}</article>)}</section> : null}
    {props.error ? <div className="automation-router-error" role="alert"><StatusText value={props.error} /><button className="button" onClick={props.onRefresh} type="button">Retry</button></div> : null}
    {props.loading && !props.instructions.length ? <div className="automation-router-loading" aria-label="Loading effective instructions"><span /><span /><span /></div> : null}
    {!props.loading && !props.error && !props.instructions.length ? <div className="automation-subflow-directory-empty"><ListChecks size={22} aria-hidden /><strong>No active instructions apply</strong><span>Create or activate guidance to give the runtime an effective instruction set.</span><button className="button button-primary" onClick={props.onCreate} type="button">New Instruction</button></div> : null}
    <ol className="automation-instruction-effective-list">{props.instructions.map((instruction, index) => { const inherited = instruction.scope?.kind === "global" || instruction.scope?.kind === "project"; return <li key={instruction.instructionId}><span className="automation-instruction-order">{index + 1}</span><article><header><div><strong>{instruction.title}</strong><span>{inherited ? "Inherited" : "This Flow"} | {instructionScopeLabel(instruction.scope?.kind)}</span></div><div><StatusBadge value={instruction.requirement ?? "advisory"} /><span className="automation-instruction-importance-label">{instructionImportance(Number(instruction.priority ?? 50))}</span></div></header><p>{instruction.body}</p><footer><span>{instruction.scope?.kind === "global" ? "All projects" : instruction.scope?.kind === "project" ? "Current project" : instruction.scope?.kind === "flow" ? "Entire Flow" : props.effectiveTargetLabel(instruction)}</span><span>Priority {instruction.priority ?? 50}</span></footer></article></li>; })}</ol>
  </section>;
}

function InstructionSaveStatus(props: { compact?: boolean; state: InstructionSaveState }) {
  const label = props.compact ? props.state === "saved" ? "Saved" : props.state === "unsaved" ? "Unsaved changes" : props.state === "saving" ? "Saving" : "Save failed" : props.state === "saved" ? "All changes saved" : props.state === "unsaved" ? "Unsaved changes" : props.state === "saving" ? "Saving instruction" : "Save failed; your draft is preserved";
  return <div aria-live="polite" className={"automation-instruction-save-state " + props.state} role="status"><span aria-hidden />{label}</div>;
}