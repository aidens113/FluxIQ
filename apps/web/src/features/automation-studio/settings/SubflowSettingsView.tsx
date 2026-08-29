"use client";

import { Combobox, Field, Modal, StatusBadge } from "../../programs/shared-ui";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Plus, Trash2 } from "lucide-react";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";
import { routerReferencesForSubflow } from "../subflows";
import { flowSettingsMetadata, flowSettingsProposalMode } from "./FlowSettingsView";
import { readSettingsSection, scrollToSettingsSection, settingsDraftIsDirty } from "./settings-model";
import { useSettingsCommands, type SettingsCommands } from "./settings-host";
import { splitSettingsValues, subflowSettingsDraft, subflowSettingsErrors, type SubflowSettingsDraft } from "./subflow-settings-model";

export type SubflowSettingsViewProps = {
  projectId: string | null;
  flow: any;
  ownership: { parentFlowId: string; subflowId: string };
};

export function SubflowSettingsView(props: SubflowSettingsViewProps) {
  const commands = useSettingsCommands();
  return <SubflowSettingsViewContent {...props} commands={commands} />;
}

export function SubflowSettingsViewContent(props: SubflowSettingsViewProps & { commands: SettingsCommands }) {
  const [subflow, setSubflow] = useState<any | null>(null);
  const [draft, setDraft] = useState<SubflowSettingsDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<SubflowSettingsDraft | null>(null);
  const [activeSection, setActiveSection] = useState(() => readSettingsSection("", "subflow"));
  useEffect(() => { const timer = window.setTimeout(() => scrollToSettingsSection(activeSection), 0); return () => window.clearTimeout(timer); }, []);
  const [loading, setLoading] = useState(Boolean(props.projectId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [parentFlow, setParentFlow] = useState<any | null>(null);
  const [instructionOptions, setInstructionOptions] = useState<any[]>([]);
  const [instructionChoice, setInstructionChoice] = useState("");
  const [router, setRouter] = useState<any | null>(null);
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSubflow(null);
    setDraft(null);
    setSavedDraft(null);
    setMessage("");
    setError("");
    if (!props.projectId) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void props.commands.loadSubflowResources({ projectId: props.projectId, flowId: props.ownership.parentFlowId, subflowId: props.ownership.subflowId }).then(([result, flowResult, instructionResult, routerResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok || !result.payload?.subflow) {
        setError(result.error ?? "Subflow settings could not be loaded.");
        return;
      }
      setSubflow(result.payload.subflow);
      setParentFlow(flowResult.ok ? flowResult.payload?.flow ?? null : null);
      setInstructionOptions(instructionResult.ok ? instructionResult.payload?.instructions ?? [] : []);
      setRouter(routerResult.ok ? routerResult.payload?.router ?? null : null);
      const nextDraft = subflowSettingsDraft(result.payload.subflow);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
    });
    return () => { cancelled = true; };
  }, [props.projectId, props.ownership.parentFlowId, props.ownership.subflowId]);
  const draftDirty = Boolean(draft && savedDraft && settingsDraftIsDirty(draft, savedDraft));
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!draftDirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [draftDirty]);
  const updateDraft = <K extends keyof SubflowSettingsDraft>(key: K, value: SubflowSettingsDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const flowInputs = parentFlow?.interface?.inputs ?? [];
  const flowOutputs = parentFlow?.interface?.outputs ?? [];
  const subflowInputs = props.flow?.interface?.inputs ?? [];
  const subflowOutputs = props.flow?.interface?.outputs ?? [];
  const settingsErrors = draft ? subflowSettingsErrors(draft, flowInputs, flowOutputs, subflowInputs, subflowOutputs) : [];
  const routeReferences = routerReferencesForSubflow(router, props.ownership.subflowId);
  const inheritedApproval = flowSettingsProposalMode(flowSettingsMetadata(parentFlow).adaptationPolicySettings?.proposalMode);
  const saveSettings = async (authorizationPin: string) => {
    if (!props.projectId || !draft || authorizationPin.trim().length < 4) return;
    setSaving(true);
    setMessage("");
    setError("");
    setSaveAuthorizationError("");
    const updateResult = await props.commands.updateSubflow({
      projectId: props.projectId,
      flowId: props.ownership.parentFlowId,
      subflowId: props.ownership.subflowId,
      expectedUpdatedAt: subflow?.updatedAt,
      authorizationPin: authorizationPin.trim(),
      name: draft.name,
      description: draft.description,
      role: draft.role,
      routeTags: splitSettingsValues(draft.routeTags),
      localInstructionIds: draft.localInstructionIds,
      proposalModeOverride: draft.proposalModeOverride === "inherit" ? null : draft.proposalModeOverride,
      inputMapping: draft.inputMapping,
      outputMapping: draft.outputMapping
    });
    const lifecycleEndpoint = draft.status !== subflow?.status ? draft.status === "active" ? "enable-flow-subflow" : draft.status === "disabled" ? "disable-flow-subflow" : "archive-flow-subflow" : null;
    const result = updateResult.ok && lifecycleEndpoint
      ? await props.commands.changeSubflowLifecycle(lifecycleEndpoint, { projectId: props.projectId, flowId: props.ownership.parentFlowId, subflowId: props.ownership.subflowId, authorizationPin: authorizationPin.trim() })
      : updateResult;
    setSaving(false);
    if (!result.ok || !result.payload?.subflow) {
      const saveError = result.error?.includes("SUBFLOW_SAVE_CONFLICT") ? "Save conflict: this subflow changed elsewhere. Your draft is preserved; reload after reviewing the other change." : result.error ?? "Subflow settings could not be saved.";
      setError(saveError);
      setSaveAuthorizationError(saveError);
      return;
    }
    setSubflow(result.payload.subflow);
    const nextDraft = subflowSettingsDraft(result.payload.subflow);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setMessage("Subflow settings saved.");
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    commitAutomationStudioMutation({
      kind: "subflow.changed",
      projectId: props.projectId,
      flowId: props.ownership.parentFlowId,
      subflowId: props.ownership.subflowId
    });
  };
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace automation-subflow-settings-workspace">
      <header>
        <div><strong>Subflow Settings</strong><span>{subflow?.name ?? props.flow?.name ?? props.ownership.subflowId} | routing, mappings, instructions, and approval behavior</span></div>
        <span className={`automation-instruction-save-state ${draftDirty ? "unsaved" : "saved"}`}><span aria-hidden />{draftDirty ? "Unsaved changes" : "Saved"}</span>
      </header>
      {error ? <p className="automation-runtime-message">{error}</p> : null}
      {message ? <p className="automation-settings-success">{message}</p> : null}
      {loading ? <div className="automation-runtime-empty">Loading subflow settings...</div> : null}
      {!loading && !draft ? <div className="automation-runtime-empty">Select a persisted subflow to edit its settings.</div> : null}
      {settingsErrors.length ? <div className="automation-settings-validation" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Fix these subflow settings before saving</strong>{settingsErrors.map((item) => <span key={item}>{item}</span>)}</div></div> : null}
      {draft ? <div className="automation-settings-layout"><nav aria-label="Subflow settings sections" className="automation-settings-section-nav">{([["subflow-settings-general", "General"], ["subflow-settings-routing", "Routing & Instructions"], ["subflow-settings-inputs", "Input Mapping"], ["subflow-settings-outputs", "Output Mapping"], ["subflow-settings-lifecycle", "Lifecycle & Ownership"]] as const).map(([id, label]) => <button aria-current={activeSection === id ? "location" : undefined} className={activeSection === id ? "selected" : ""} key={id} onClick={() => { setActiveSection(id); scrollToSettingsSection(id); }} type="button">{label}</button>)}</nav><div className="automation-flow-settings-grid">
        <section className="automation-settings-panel" id="subflow-settings-general">
          <header><strong>Subflow Identity</strong><span>Name, responsibility, and routing role</span></header>
          <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Subflow name" /></label>
          <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this subflow is responsible for." /></label>
          <label><span>Role</span><select value={draft.role} onChange={(event) => updateDraft("role", event.target.value as SubflowSettingsDraft["role"])}><option value="primary">Primary</option><option value="site">Site</option><option value="screen">Screen</option><option value="integration">Integration</option><option value="recovery">Recovery</option><option value="fallback">Fallback</option><option value="utility">Utility</option></select></label>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide" id="subflow-settings-routing">
          <header><strong>Routing and Instructions</strong><span>Matching hints, Router usage, and named scoped guidance</span></header>
          <label><span>Route tags</span><input value={draft.routeTags} onChange={(event) => updateDraft("routeTags", event.target.value)} placeholder="checkout, authenticated, desktop" /></label>
          <div className="automation-settings-divider"><strong>Local instructions</strong><span>Guidance bound specifically to this subflow</span></div>
          <div className="automation-settings-secret-picker"><Combobox label="Add instruction" onChange={setInstructionChoice} options={instructionOptions.filter((instruction) => !draft.localInstructionIds.includes(instruction.instructionId)).map((instruction) => ({ value: instruction.instructionId, label: instruction.title, description: instruction.scopeKind + " | " + instruction.status }))} placeholder="Search Flow instructions" value={instructionChoice} /><button className="button" disabled={!instructionChoice} onClick={() => { updateDraft("localInstructionIds", [...draft.localInstructionIds, instructionChoice]); setInstructionChoice(""); }} type="button"><Plus size={14} aria-hidden />Add Instruction</button></div>
          <div className="automation-settings-binding-list">{draft.localInstructionIds.map((instructionId) => { const instruction = instructionOptions.find((item) => item.instructionId === instructionId); return <div className="automation-settings-dependency-row" key={instructionId}><div><strong>{instruction?.title ?? "Unavailable instruction"}</strong><span>{instruction ? instruction.scopeKind + " | " + instruction.status : "The saved instruction is no longer available."}</span></div><button aria-label={"Remove " + (instruction?.title ?? "instruction")} className="automation-icon-button" onClick={() => updateDraft("localInstructionIds", draft.localInstructionIds.filter((id) => id !== instructionId))} title="Remove instruction" type="button"><Trash2 size={15} aria-hidden /></button></div>; })}{!draft.localInstructionIds.length ? <div className="automation-runtime-empty">No local instructions bound.</div> : null}</div>
          <fieldset className="automation-settings-choice"><legend>Adaptation approval</legend><div className="automation-instruction-segments">{([["inherit", "Inherit"], ["auto", "Automatic"], ["mixed", "Manual for risky"], ["manual", "Manual only"]] as const).map(([value, label]) => <button aria-pressed={draft.proposalModeOverride === value} className={draft.proposalModeOverride === value ? "selected" : ""} key={value} onClick={() => updateDraft("proposalModeOverride", value)} type="button">{label}</button>)}</div><small>Effective approval: {draft.proposalModeOverride === "inherit" ? inheritedApproval === "auto" ? "Automatic from parent Flow" : inheritedApproval === "mixed" ? "Manual for risky from parent Flow" : "Manual only from parent Flow" : draft.proposalModeOverride === "auto" ? "Automatic override" : draft.proposalModeOverride === "mixed" ? "Manual for risky override" : "Manual only override"}.</small></fieldset>
          <div className="automation-settings-divider"><strong>Router references</strong><span>Read-only rules owned by the parent Flow Router</span></div>
          <div className="automation-settings-binding-list">{routeReferences.map((reference) => <div className="automation-settings-dependency-row" key={reference.id}><div><strong>{reference.name}</strong><span>{reference.condition} | {reference.status}</span></div><StatusBadge value={reference.status} /></div>)}{!routeReferences.length ? <div className="automation-runtime-empty">No Router rule currently targets this subflow.</div> : null}</div>
        </section>
        <SubflowMappingEditor
          leftKey="flowInputId"
          leftOptions={flowInputs}
          leftLabel="Flow input"
          onChange={(inputMapping) => updateDraft("inputMapping", inputMapping as SubflowSettingsDraft["inputMapping"])}
          rightKey="subflowInputId"
          rightOptions={subflowInputs}
          rightLabel="Subflow input"
          rows={draft.inputMapping}
          sectionId="subflow-settings-inputs"
          title="Input Mapping"
        />
        <SubflowMappingEditor
          leftKey="subflowOutputId"
          leftOptions={subflowOutputs}
          leftLabel="Subflow output"
          onChange={(outputMapping) => updateDraft("outputMapping", outputMapping as SubflowSettingsDraft["outputMapping"])}
          rightKey="flowOutputId"
          rightOptions={flowOutputs}
          rightLabel="Flow output"
          rows={draft.outputMapping}
          sectionId="subflow-settings-outputs"
          title="Output Mapping"
        />
        <section className="automation-settings-panel automation-settings-panel-wide" id="subflow-settings-lifecycle">
          <header><strong>Lifecycle</strong><span>Whether the parent Router may select and run this subflow</span></header>
          <fieldset className="automation-settings-choice"><legend>Status</legend><div className="automation-instruction-segments">{([["active", "Active"], ["disabled", "Disabled"], ["archived", "Archived"]] as const).map(([value, label]) => <button aria-pressed={draft.status === value} className={draft.status === value ? "selected" : ""} key={value} onClick={() => updateDraft("status", value)} type="button">{label}</button>)}</div><small>{draft.status === "active" ? "Available to Router rules and runtime execution." : draft.status === "disabled" ? "Retained for editing but unavailable to new runs." : "Hidden from normal use and retained for audit history."}</small></fieldset>
          <div className="automation-settings-effective-list"><div className="automation-settings-effective-row"><span>Ownership</span><div><strong>Parent Flow</strong><small>{parentFlow?.name ?? "Parent Flow"}</small></div><StatusBadge value={draft.status} /><span /></div><div className="automation-settings-effective-row"><span>Stability</span><div><strong>Completed runs</strong><small>{subflow?.stability?.runCount ?? 0}</small></div><span /><span /></div></div>
          <details className="automation-settings-technical-details"><summary>Technical ownership identifiers</summary><div className="automation-settings-technical-list"><code>{props.ownership.parentFlowId}</code><code>{props.ownership.subflowId}</code><code>{props.flow?.flowId ?? subflow?.graphFlowId ?? "-"}</code></div></details>
        </section>
      </div></div> : null}
      {draft ? <footer className="automation-settings-form-footer"><span>{draftDirty ? "Unsaved subflow changes" : "All subflow settings saved"}</span><div><button className="button" disabled={!draftDirty || saving || !savedDraft} onClick={() => savedDraft && setDraft(savedDraft)} type="button">Discard Changes</button><button className="button button-primary" disabled={!props.projectId || !draftDirty || saving || settingsErrors.length > 0} onClick={() => { setSaveAuthorizationPin(""); setSaveAuthorizationError(""); setSaveAuthorizationOpen(true); }} type="button">{saving ? "Saving..." : "Save Subflow Settings"}</button></div></footer> : null}
      {saveAuthorizationOpen ? <Modal title="Authorize Subflow Settings Save" onClose={() => saving ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this Subflow Settings write with your security PIN. Your draft remains intact if authorization or conflict checks fail.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saving} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saving} onClick={() => void saveSettings(saveAuthorizationPin)} type="button">{saving ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}
    </section>
  );
}

export function SubflowMappingEditor(props: {
  sectionId?: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftKey: string;
  rightKey: string;
  leftOptions: any[];
  rightOptions: any[];
  rows: Array<Record<string, any>>;
  onChange(rows: Array<Record<string, any>>): void;
}) {
  const updateRow = (index: number, key: string, value: string | boolean) => props.onChange(props.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const addRow = () => props.onChange([...props.rows, { [props.leftKey]: "", [props.rightKey]: "", required: false }]);
  const optionLabel = (port: any) => port.name + (port.valueType?.kind ? " (" + (port.valueType.kind === "string" ? "Text" : port.valueType.kind === "boolean" ? "Yes / No" : port.valueType.kind === "json" ? "Structured" : "Number") + ")" : "");
  return (
    <section className="automation-settings-panel automation-settings-panel-wide automation-subflow-mapping-panel" id={props.sectionId}>
      <header><strong>{props.title}</strong><span>Map compatible named values across the parent Flow and subflow boundary</span></header>
      <div className="automation-subflow-mapping-list">
        {props.rows.map((row, index) => <div className="automation-subflow-mapping-row" key={props.title + ":" + index}>
          <label><span>{props.leftLabel}</span><select value={String(row[props.leftKey] ?? "")} onChange={(event) => updateRow(index, props.leftKey, event.target.value)}><option value="">Choose {props.leftLabel.toLowerCase()}</option>{props.leftOptions.map((port) => <option key={port.id} value={port.id}>{optionLabel(port)}</option>)}</select></label>
          <ChevronRight aria-hidden size={16} />
          <label><span>{props.rightLabel}</span><select value={String(row[props.rightKey] ?? "")} onChange={(event) => updateRow(index, props.rightKey, event.target.value)}><option value="">Choose {props.rightLabel.toLowerCase()}</option>{props.rightOptions.map((port) => <option key={port.id} value={port.id}>{optionLabel(port)}</option>)}</select></label>
          <label className="automation-subflow-mapping-required"><input checked={row.required === true} onChange={(event) => updateRow(index, "required", event.target.checked)} type="checkbox" /><span>Required</span></label>
          <button className="automation-icon-button" onClick={() => props.onChange(props.rows.filter((_, rowIndex) => rowIndex !== index))} title="Remove mapping" aria-label="Remove mapping" type="button"><Trash2 aria-hidden size={15} /></button>
        </div>)}
        {!props.rows.length ? <div className="automation-runtime-empty">No mappings configured.</div> : null}
      </div>
      {!props.leftOptions.length || !props.rightOptions.length ? <div className="automation-settings-inline-notice warning"><AlertTriangle size={16} aria-hidden /><span>Define named ports in both the parent Flow and subflow Nodes settings before adding this mapping.</span></div> : null}
      <button className="automation-runtime-row-action automation-subflow-add-mapping" disabled={!props.leftOptions.length || !props.rightOptions.length} onClick={addRow} type="button"><Plus aria-hidden size={14} /> Add mapping</button>
    </section>
  );
}

export * from "./subflow-settings-model";
