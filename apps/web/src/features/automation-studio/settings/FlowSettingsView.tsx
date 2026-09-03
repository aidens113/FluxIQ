"use client";

import { Combobox, Field, Modal, StatusBadge } from "../../programs/shared-ui";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeftRight, Bot, Boxes, CircleCheck, CircleDollarSign, Gauge, Info, ListChecks, Plus, Settings2, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";
import { JsonToggle } from "../runtime";
import { readSettingsSection, settingsConcurrentRevisionAction, settingsDraftIsDirty } from "./settings-model";
import { useSettingsCommands, type SettingsCommands } from "./settings-host";
import { SettingsSectionLayout, type SettingsSectionDefinition } from "./SettingsSectionLayout";
import { FLOW_LLM_PROVIDERS, FLOW_SETTINGS_DEFAULT_VALUES, applyFlowAdaptationMode, applyFlowAdaptationPreset, applyFlowTrainingMode, buildFlowSettingsSavePayload, flowAdaptationErrors, flowEffectiveSettings, flowGeneralRuntimeErrors, flowLimitsInterfaceErrors, flowLlmProvider, flowLlmSettingsErrors, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail, flowSettingsMetadata, normalizedProviderLabel, type FlowPortSettingsDraft, type FlowSettingsDraft } from "./flow-settings-model";
import { useDirtyViewRegistration } from "../workspace/DirtyViewGuard";
import { automationStudioViewId } from "../views/view-registry";

export type FlowSettingsViewProps = { projectId: string | null; flow: any };

const FLOW_SETTINGS_SECTIONS = [
  { id: "flow-settings-general", label: "General", description: "Identity and visibility", icon: Settings2 },
  { id: "flow-settings-runtime", label: "Runtime", description: "Execution behavior", icon: Gauge },
  { id: "flow-settings-safety", label: "Safety", description: "Approval gates", icon: ShieldCheck },
  { id: "flow-settings-adaptation", label: "Adaptation", description: "Learning policy", icon: Sparkles },
  { id: "flow-settings-limits", label: "Limits", description: "Budgets and retries", icon: CircleDollarSign },
  { id: "flow-settings-inputs", label: "Inputs & Outputs", description: "Flow interface", icon: ArrowLeftRight },
  { id: "flow-settings-dependencies", label: "Dependencies", description: "Published Flows", icon: Boxes },
  { id: "flow-settings-llm", label: "LLM Connection", description: "Provider and model", icon: Bot },
  { id: "flow-settings-effective", label: "Effective Values", description: "Resolved configuration", icon: ListChecks }
] satisfies readonly SettingsSectionDefinition[];

export function FlowSettingsView(props: FlowSettingsViewProps) {
  const commands = useSettingsCommands();
  return <FlowSettingsViewContent {...props} commands={commands} />;
}

export function FlowSettingsViewContent(props: FlowSettingsViewProps & { commands: SettingsCommands }) {
  const [savedFlow, setSavedFlow] = useState<any | null>(() => props.flow?.metadata?.summaryOnly === true ? null : props.flow ?? null);
  const flow = savedFlow?.flowId && savedFlow.flowId === props.flow?.flowId ? savedFlow : props.flow;
  const metadata = flowSettingsMetadata(flow);
  const [draft, setDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [baseDraft, setBaseDraft] = useState<FlowSettingsDraft>(() => flowSettingsDraftFromFlow(flow));
  const [activeSection, setActiveSection] = useState(() => readSettingsSection("", "flow"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(Boolean(props.projectId && props.flow?.flowId));
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [settingsLoadRevision, setSettingsLoadRevision] = useState(0);
  const [llmSecrets, setLlmSecrets] = useState<any[]>([]);
  const [llmSecretsLoading, setLlmSecretsLoading] = useState(false);
  const [llmSecretsError, setLlmSecretsError] = useState("");
  const [flowPublications, setFlowPublications] = useState<any[]>([]);
  const [publicationsLoading, setPublicationsLoading] = useState(false);
  const [publicationsError, setPublicationsError] = useState("");
  const [dependencyChoice, setDependencyChoice] = useState("");
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  const [revisionConflict, setRevisionConflict] = useState<any | null>(null);
  const [compareConflict, setCompareConflict] = useState(false);
  useEffect(() => {
    setSavedFlow(props.flow?.metadata?.summaryOnly === true ? null : props.flow ?? null);
    const nextDraft = flowSettingsDraftFromFlow(props.flow);
    setDraft(nextDraft);
    setBaseDraft(nextDraft);
    setMessage("");
    setError("");
    setSettingsLoadError("");
    setRevisionConflict(null);
    setCompareConflict(false);
  }, [props.flow?.flowId]);
  useEffect(() => {
    let cancelled = false;
    const projectId = props.projectId;
    const flowId = props.flow?.flowId;
    if (!projectId || !flowId) {
      setSettingsLoading(false);
      return;
    }
    setSettingsLoading(true);
    setError("");
    setSettingsLoadError("");
    void props.commands.loadFlow({ projectId, flowId }).then((result) => {
      if (cancelled) return;
      setSettingsLoading(false);
      if (!result.ok || !result.payload?.flow) {
        const loadError = result.error ?? "Flow settings could not be loaded.";
        setError(loadError);
        setSettingsLoadError(loadError);
        return;
      }
      const loadedFlow = flowSettingsFlowFromDetail(props.flow, result.payload.flow);
      const nextDraft = flowSettingsDraftFromFlow(loadedFlow);
      setSavedFlow(loadedFlow);
      setDraft(nextDraft);
      setBaseDraft(nextDraft);
      setSettingsLoadError("");
      setRevisionConflict(null);
      setCompareConflict(false);
    });
    return () => { cancelled = true; };
  }, [props.projectId, props.flow?.flowId, props.commands, settingsLoadRevision]);
  useEffect(() => {
    let cancelled = false;
    if (!props.projectId || !flow?.flowId) { setLlmSecrets([]); setLlmSecretsError(""); return; }
    setLlmSecretsLoading(true);
    setLlmSecretsError("");
    void props.commands.listLlmSecrets().then((result) => {
      if (cancelled) return;
      setLlmSecretsLoading(false);
      if (!result.ok) { setLlmSecretsError(result.error ?? "Encrypted keys could not be loaded."); setLlmSecrets([]); return; }
      setLlmSecrets((result.payload?.keys ?? []).filter((key) => key.kind === "llm"));
    });
    return () => { cancelled = true; };
  }, [props.projectId, flow?.flowId]);  useEffect(() => {
    let cancelled = false;
    if (!props.projectId || !flow?.flowId) { setFlowPublications([]); setPublicationsError(""); return; }
    setPublicationsLoading(true);
    setPublicationsError("");
    void props.commands.listPublications({ projectId: props.projectId }).then((result) => {
      if (cancelled) return;
      setPublicationsLoading(false);
      if (!result.ok) { setPublicationsError(result.error ?? "Published Flow dependencies could not be loaded."); setFlowPublications([]); return; }
      setFlowPublications((result.payload?.publications ?? []).filter((publication) => publication.status === "published" && publication.flowId !== flow.flowId));
    });
    return () => { cancelled = true; };
  }, [props.projectId, flow?.flowId]);  const draftDirty = settingsDraftIsDirty(draft, baseDraft);
  useEffect(() => {
    if (!props.flow?.flowId || props.flow.flowId !== flow?.flowId) return;
    const revisionAction = settingsConcurrentRevisionAction({ currentRevision: flow?.updatedAt, incomingRevision: props.flow.updatedAt, dirty: draftDirty });
    if (revisionAction === "ignore") return;
    const incomingDraft = flowSettingsDraftFromFlow(props.flow);
    if (revisionAction === "conflict") {
      if (revisionConflict?.updatedAt !== props.flow.updatedAt) setRevisionConflict(props.flow);
      return;
    }
    setSavedFlow(props.flow);
    setDraft(incomingDraft);
    setBaseDraft(incomingDraft);
    setRevisionConflict(null);
    setCompareConflict(false);
  }, [props.flow?.flowId, props.flow?.updatedAt]);
  const generalRuntimeErrors = flowGeneralRuntimeErrors(draft);
  const effectiveSettings = flowEffectiveSettings(flow, draft);
  const resetEffectiveSetting = (key: keyof FlowSettingsDraft) => {
    const value = FLOW_SETTINGS_DEFAULT_VALUES[key];
    if (value === undefined) return;
    if (key === "trainingMode") { setDraft((current) => applyFlowTrainingMode(current, value as FlowSettingsDraft["trainingMode"])); return; }
    if (key === "adaptationPreset") { setDraft((current) => applyFlowAdaptationPreset(current, value as FlowSettingsDraft["adaptationPreset"])); return; }
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const dependencyOptions = flowPublications.map((publication) => ({ value: `flow:${publication.flowId}@${publication.version}`, label: `${publication.snapshot?.name ?? publication.flowId} @ ${publication.version}`, description: publication.snapshot?.description ?? "Published Flow" }));
  const inferredDependencies = (flow?.nodes ?? []).filter((node: any) => node.compositeTarget || node.parameterValues?.target?.flowId).map((node: any) => { const target = node.compositeTarget ?? node.parameterValues.target; return { pin: `flow:${target.flowId}@${target.version ?? "current"}`, label: target.name ?? target.flowId, version: target.version ?? "current" }; });
  const selectedProvider = flowLlmProvider(draft.llmProvider);
  const compatibleLlmSecrets = llmSecrets.filter((key) => key.enabled === true && normalizedProviderLabel(key.provider) === normalizedProviderLabel(selectedProvider.label) && (key.scope === "global" || (key.scope === "flow" && key.scopeRef === flow?.flowId)));
  const llmSettingsErrors = flowLlmSettingsErrors(draft, compatibleLlmSecrets, !llmSecretsLoading && !llmSecretsError);
  const llmSecretError = llmSettingsErrors.find((item) => item.toLowerCase().includes("key")) ?? "";
  const adaptationErrors = flowAdaptationErrors(draft);
  const limitsInterfaceErrors = flowLimitsInterfaceErrors(draft);
  const settingsErrors = [...generalRuntimeErrors, ...llmSettingsErrors, ...adaptationErrors, ...limitsInterfaceErrors];
  const settingsPending = settingsLoading;
  const updateDraft = <K extends keyof FlowSettingsDraft>(key: K, value: FlowSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const saveSettings = async (authorizationPin: string, propagateError = false) => {
    if (!props.projectId || !flow?.flowId || settingsErrors.length || authorizationPin.trim().length < 4) {
      if (propagateError) throw new Error(settingsErrors[0] ?? "Flow Settings are not ready to save.");
      return false;
    }
    setSaving(true);
    setMessage("");
    setError("");
    setSaveAuthorizationError("");
    const result = await props.commands.saveFlow({
      projectId: props.projectId,
      flowId: flow.flowId,
      authorizationPin: authorizationPin.trim(),
      expectedUpdatedAt: flow.updatedAt,
      flow: buildFlowSettingsSavePayload(flow, draft)
    });
    setSaving(false);
    if (!result.ok || !result.payload?.flow) {
      const saveError = result.error?.includes("FLOW_SAVE_CONFLICT") ? "Save conflict: this Flow changed elsewhere. Your Settings draft is preserved; reload after reviewing the other change." : result.error ?? "Flow settings could not be saved.";
      setError(saveError);
      setSaveAuthorizationError(saveError);
      if (result.error?.includes("FLOW_SAVE_CONFLICT") && props.flow?.flowId === flow.flowId) setRevisionConflict(props.flow);
      if (propagateError) throw new Error(saveError);
      return false;
    }
    const loadedFlow = flowSettingsFlowFromDetail(flow, result.payload.flow);
    setSavedFlow(loadedFlow);
    const nextDraft = flowSettingsDraftFromFlow(loadedFlow);
    setDraft(nextDraft);
    setBaseDraft(nextDraft);
    setMessage("Settings saved.");
    setSaveAuthorizationOpen(false);
    setSaveAuthorizationPin("");
    commitAutomationStudioMutation({
      kind: "flow-settings.changed",
      projectId: props.projectId,
      flowId: flow.flowId
    });
    return true;
  };
  useDirtyViewRegistration({
    id: `flow-settings:${props.projectId ?? "none"}:${flow?.flowId ?? "none"}`,
    viewId: automationStudioViewId.settings,
    label: `Flow Settings: ${flow?.name ?? "current Flow"}`,
    dirty: draftDirty,
    save: async (authorizationPin) => {
      if (authorizationPin) await saveSettings(authorizationPin, true);
      else { setSaveAuthorizationPin(""); setSaveAuthorizationError(""); setSaveAuthorizationOpen(true); }
    },
    discard: () => setDraft(baseDraft)
  });
  return (
    <section className="automation-runs-workspace automation-flow-settings-workspace">
      <header>
        <div><strong>Settings</strong><span>{draft.name || flow?.name || "Select a Flow"} | training, approval, LLM, and safety gates</span></div>
        <span className={`automation-instruction-save-state ${draftDirty ? "unsaved" : "saved"}`}><span aria-hidden />{draftDirty ? "Unsaved changes" : "Saved"}</span>
      </header>
      <div aria-live="polite" className="automation-settings-feedback">
        {error ? <p className="automation-runtime-message">{error}</p> : null}
        {message ? <p className="automation-settings-success">{message}</p> : null}
        {revisionConflict ? <div className="automation-settings-conflict" role="alert"><AlertTriangle size={17} aria-hidden /><div><strong>This Flow changed elsewhere</strong><span>Your local draft is preserved. Compare the saved values, reload them, or rebase your draft onto the newer revision.</span>{compareConflict ? <details open><summary>Saved value comparison</summary><div className="automation-settings-conflict-compare"><section><strong>Your starting values</strong><pre>{JSON.stringify(baseDraft, null, 2)}</pre></section><section><strong>Newest saved values</strong><pre>{JSON.stringify(flowSettingsDraftFromFlow(revisionConflict), null, 2)}</pre></section></div></details> : null}</div><div><button className="button" onClick={() => setCompareConflict((current) => !current)} type="button">{compareConflict ? "Hide Compare" : "Compare"}</button><button className="button" onClick={() => { const next = flowSettingsDraftFromFlow(revisionConflict); setSavedFlow(revisionConflict); setDraft(next); setBaseDraft(next); setRevisionConflict(null); setCompareConflict(false); setError(""); }} type="button">Reload Saved</button><button className="button button-primary" onClick={() => { const nextBase = flowSettingsDraftFromFlow(revisionConflict); setSavedFlow(revisionConflict); setBaseDraft(nextBase); setRevisionConflict(null); setCompareConflict(false); setError(""); }} type="button">Keep My Draft</button></div></div> : null}
        {settingsErrors.length ? <div className="automation-settings-validation" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Fix these settings before saving</strong>{settingsErrors.map((item) => <span key={item}>{item}</span>)}</div></div> : null}
      </div>
      {settingsPending ? <div className="automation-runtime-empty"><span aria-hidden className="automation-inline-spinner" />Loading saved Flow settings...</div> : settingsLoadError ? <div className="automation-runtime-empty"><strong>Flow settings are unavailable</strong><span>{settingsLoadError}</span><button className="button" onClick={() => setSettingsLoadRevision((current) => current + 1)} type="button">Retry</button></div> : <SettingsSectionLayout activeSection={activeSection} ariaLabel="Flow settings sections" onActiveSectionChange={setActiveSection} sections={FLOW_SETTINGS_SECTIONS}>
        <section className="automation-settings-panel" id="flow-settings-general">
          <header><strong>Flow Identity</strong><span>Name, description, and catalog visibility</span></header>
          <label><span>Name</span><input aria-invalid={!draft.name.trim()} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Flow name" />{!draft.name.trim() ? <small>Flow name is required.</small> : null}</label>
          <label><span>Description</span><textarea maxLength={1000} rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this Flow is responsible for." /><small>{draft.description.length}/1000 characters</small></label>
          <fieldset className="automation-settings-choice"><legend>Visibility</legend><div className="automation-instruction-segments"><button aria-pressed={draft.visibility === "private"} className={draft.visibility === "private" ? "selected" : ""} onClick={() => updateDraft("visibility", "private")} type="button">Private</button><button aria-pressed={draft.visibility === "public"} className={draft.visibility === "public" ? "selected" : ""} onClick={() => updateDraft("visibility", "public")} type="button">Public composite</button></div><small>Public Flows can be published for reuse when their interface is valid.</small></fieldset>
        </section>
        <section className="automation-settings-panel" id="flow-settings-runtime">
          <header><strong>Runtime Mode</strong><span>Choose how this Flow may use LLM assistance and adaptations</span></header>
          <fieldset className="automation-settings-choice automation-settings-mode-choice"><legend>LLM intervention mode</legend><div className="automation-settings-mode-grid">{([ ["fully_adaptive", "Fully adaptive", "Use LLM recovery and auto-apply safe validated adaptations."], ["manual_approval", "Manual approval", "Use LLM recovery but hold every adaptation for review."], ["no_llm_intervention", "No LLM intervention", "Run only saved deterministic behavior."] ] as const).map(([value, label, detail]) => <button aria-pressed={draft.adaptationMode === value} className={draft.adaptationMode === value ? "selected" : ""} key={value} onClick={() => setDraft((current) => applyFlowAdaptationMode(current, value))} type="button"><strong>{label}</strong><span>{detail}</span></button>)}</div></fieldset>

        </section>
        <section className="automation-settings-panel" id="flow-settings-runtime-defaults">
          <header><strong>Runtime Defaults</strong><span>Execution limits applied unless a node defines a narrower limit</span></header>
          <label><span>Flow timeout</span><div className="automation-settings-unit-input"><input aria-invalid={!Number.isFinite(Number(draft.timeoutSeconds)) || Number(draft.timeoutSeconds) < 1 || Number(draft.timeoutSeconds) > 3600} min={1} max={3600} type="number" value={draft.timeoutSeconds} onChange={(event) => updateDraft("timeoutSeconds", event.target.value)} /><span>seconds</span></div><small>Allowed range: 1 second to 1 hour.</small></label>
          <label><span>Maximum concurrent runs</span><input aria-invalid={!Number.isInteger(Number(draft.maxConcurrency)) || Number(draft.maxConcurrency) < 1 || Number(draft.maxConcurrency) > 100} min={1} max={100} step={1} type="number" value={draft.maxConcurrency} onChange={(event) => updateDraft("maxConcurrency", event.target.value)} /><small>Additional runs wait in the queue when this limit is reached.</small></label>
        </section>        <section className="automation-settings-panel" id="flow-settings-safety">
          <header><strong>Safety</strong><span>Deterministic gates that remain in force around learned behavior</span></header>
          <SettingsToggle checked={draft.manualReviewForStructuralChanges} label="Review structural changes manually" onChange={(checked) => updateDraft("manualReviewForStructuralChanges", checked)} />
          <SettingsToggle checked={draft.requireApprovalForDestructiveChanges} label="Require approval before deleting or disabling behavior" onChange={(checked) => updateDraft("requireApprovalForDestructiveChanges", checked)} />
          <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>Node permissions and side-effect access are enforced by runtime capability grants, not bypass switches in Flow Settings.</span></div>
        </section>
        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-adaptation">
          <header><strong>Adaptations</strong><span>What the runtime may learn, propose, edit, and promote</span></header><label><span>Adaptation policy</span><select value={draft.adaptationPolicyId} onChange={(event) => updateDraft("adaptationPolicyId", event.target.value)}>{draft.adaptationPolicyId && draft.adaptationPolicyId !== "policy.default" ? <option value={draft.adaptationPolicyId}>Current custom policy</option> : null}<option value="policy.default">Default adaptive policy</option></select></label>
          <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>{draft.adaptationMode === "fully_adaptive" ? "Safe validated adaptations are applied automatically." : draft.adaptationMode === "manual_approval" ? "Every generated adaptation waits for your approval." : "Adaptation creation and LLM intervention are disabled."}</span></div>
          {draft.adaptationMode === "fully_adaptive" ? <SettingsToggle checked={draft.requireFirstManualReviewBeforeAutoPromotion} label="Require first adaptation to be reviewed manually" onChange={(checked) => updateDraft("requireFirstManualReviewBeforeAutoPromotion", checked)} /> : null}
          {draft.adaptationMode !== "no_llm_intervention" ? <details className="automation-settings-technical-details"><summary>Advanced adaptation permissions</summary><div className="automation-settings-toggle-grid">
            <SettingsToggle checked={draft.manualReviewForStructuralChanges} label="Manual review for structural changes" onChange={(checked) => updateDraft("manualReviewForStructuralChanges", checked)} />
            <SettingsToggle checked={draft.allowCreateRecoveryPaths} label="Create recovery paths" onChange={(checked) => updateDraft("allowCreateRecoveryPaths", checked)} />
            <SettingsToggle checked={draft.allowModifyRouter} label="Modify Flow Map routes" onChange={(checked) => updateDraft("allowModifyRouter", checked)} />
            <SettingsToggle checked={draft.allowModifySubflows} label="Modify subflows" onChange={(checked) => updateDraft("allowModifySubflows", checked)} />
            <SettingsToggle checked={draft.allowCreateSubflows} label="Create subflows" onChange={(checked) => updateDraft("allowCreateSubflows", checked)} />
            <SettingsToggle checked={draft.allowModifyExpectations} label="Modify expectations" onChange={(checked) => updateDraft("allowModifyExpectations", checked)} />
            <SettingsToggle checked={draft.allowModifyActionTargets} label="Modify action targets" onChange={(checked) => updateDraft("allowModifyActionTargets", checked)} />
            <SettingsToggle checked={draft.allowDeleteOrDisableBehavior} label="Delete or disable behavior" onChange={(checked) => updateDraft("allowDeleteOrDisableBehavior", checked)} />
          </div></details> : null}
          <div className="automation-settings-inline-fields">
            <label><span>Adaptation interventions/run</span><input min={0} type="number" value={draft.maxAdaptationInterventionsPerRun} onChange={(event) => updateDraft("maxAdaptationInterventionsPerRun", event.target.value)} /></label>
            <label><span>Adaptation cost/run</span><input min={0} step={0.01} type="number" value={draft.maxAdaptationCostUsdPerRun} onChange={(event) => updateDraft("maxAdaptationCostUsdPerRun", event.target.value)} /></label>
          </div>
        </section>
        <section className="automation-settings-panel" id="flow-settings-limits">
          <header><strong>LLM Budget</strong><span>Caps for intervention frequency, token use, and spend</span></header>
          <div className="automation-settings-inline-fields">
            <label><span>Max interventions/run</span><input min={0} type="number" value={draft.maxInterventionsPerRun} onChange={(event) => updateDraft("maxInterventionsPerRun", event.target.value)} /></label>
            <label><span>Max tokens/run</span><input min={0} type="number" value={draft.maxTokensPerRun} onChange={(event) => updateDraft("maxTokensPerRun", event.target.value)} /></label>
          </div>
          <label><span>Max cost/training window</span><input min={0} step={0.01} type="number" value={draft.maxCostUsdPerTrainingWindow} onChange={(event) => updateDraft("maxCostUsdPerTrainingWindow", event.target.value)} /></label>
          <label><span>When exhausted</span><select value={draft.budgetExhaustedBehavior} onChange={(event) => updateDraft("budgetExhaustedBehavior", event.target.value as FlowSettingsDraft["budgetExhaustedBehavior"])}><option value="ask">Ask before continuing</option><option value="stop">Stop training</option></select></label><div className="automation-settings-divider"><strong>Recovery limits</strong><span>Bound repeated deterministic recovery work.</span></div><div className="automation-settings-inline-fields"><label><span>Retries per action</span><input min={0} max={20} step={1} type="number" value={draft.maxRetriesPerAction} onChange={(event) => updateDraft("maxRetriesPerAction", event.target.value)} /></label><label><span>Recovery attempts/subflow</span><input min={0} max={20} step={1} type="number" value={draft.maxRecoveryAttemptsPerSubflow} onChange={(event) => updateDraft("maxRecoveryAttemptsPerSubflow", event.target.value)} /></label></div><label><span>Reroutes per run</span><input min={0} max={20} step={1} type="number" value={draft.maxReroutesPerRun} onChange={(event) => updateDraft("maxReroutesPerRun", event.target.value)} /></label>
        </section>
        <FlowPortSettingsEditor kind="input" ports={draft.interfaceInputs} onChange={(interfaceInputs) => updateDraft("interfaceInputs", interfaceInputs)} />
        <FlowPortSettingsEditor kind="output" ports={draft.interfaceOutputs} onChange={(interfaceOutputs) => updateDraft("interfaceOutputs", interfaceOutputs)} />
        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-dependencies">
          <header><strong>Dependencies</strong><span>Published Flows this Flow calls and the versions it is pinned to</span></header>
          {flow?.source?.mode === "code" ? <><div className="automation-settings-secret-picker"><Combobox disabled={publicationsLoading} label="Add published Flow" onChange={setDependencyChoice} options={dependencyOptions.filter((option) => !draft.dependencyPins.includes(option.value))} placeholder={publicationsLoading ? "Loading published Flows" : "Search published Flows"} value={dependencyChoice} /><button className="button" disabled={!dependencyChoice} onClick={() => { updateDraft("dependencyPins", [...draft.dependencyPins, dependencyChoice]); setDependencyChoice(""); }} type="button"><Plus size={14} aria-hidden />Add Dependency</button></div><div className="automation-settings-dependency-list">{draft.dependencyPins.map((pin) => { const option = dependencyOptions.find((candidate) => candidate.value === pin); return <div className="automation-settings-dependency-row" key={pin}><div><strong>{option?.label ?? "Configured dependency"}</strong><span>{option?.description ?? "Pinned by code source"}</span></div><button aria-label={`Remove ${option?.label ?? "dependency"}`} className="automation-icon-button" onClick={() => updateDraft("dependencyPins", draft.dependencyPins.filter((item) => item !== pin))} title="Remove dependency" type="button"><Trash2 size={15} aria-hidden /></button></div>; })}</div></> : <div className="automation-settings-dependency-list">{inferredDependencies.map((dependency: { pin: string; label: string; version: string }) => <div className="automation-settings-dependency-row" key={dependency.pin}><div><strong>{dependency.label}</strong><span>Version {dependency.version} | inferred from a Call Flow node</span></div></div>)}{!inferredDependencies.length ? <div className="automation-runtime-empty">No Flow dependencies are used by this graph.</div> : null}</div>}
          {publicationsError ? <div className="automation-settings-inline-notice error" role="alert"><AlertCircle size={16} aria-hidden /><span>{publicationsError}</span></div> : null}
          {flow?.scope?.kind === "global" && draft.authorizedDomainIds.length ? <details><summary>Authorized domain grants</summary><div className="automation-settings-technical-list">{draft.authorizedDomainIds.map((domainId) => <code key={domainId}>{domainId}</code>)}</div></details> : null}
        </section>        <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-llm">
          <header><strong>LLM Connection</strong><span>Provider, model, and encrypted credential used for assisted recovery and adaptation</span></header>
          {!draft.allowLlmIntervention ? <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>LLM intervention is currently disabled. This connection will remain configured for later use.</span></div> : null}
          <div className="automation-settings-inline-fields">
            <label><span>Provider</span><select value={draft.llmProvider} onChange={(event) => { const provider = flowLlmProvider(event.target.value); updateDraft("llmProvider", provider.id); updateDraft("llmModel", provider.models[0]); updateDraft("llmSecretKeyId", ""); }}>{FLOW_LLM_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            <label><span>Model</span><select value={draft.llmModel} onChange={(event) => updateDraft("llmModel", event.target.value)}>{(!selectedProvider.models.includes(draft.llmModel as never) && draft.llmModel ? [draft.llmModel, ...selectedProvider.models] : selectedProvider.models).map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
          </div>
          {draft.llmProvider === "host" || draft.llmProvider === "ollama" ? <div className="automation-settings-secret-summary"><CircleCheck size={17} aria-hidden /><div><strong>No encrypted API key required</strong><span>{draft.llmProvider === "host" ? "The host application supplies this provider connection." : "Ollama uses the host-configured local endpoint."}</span></div></div> : <div className="automation-settings-secret-picker"><Combobox disabled={llmSecretsLoading} {...(llmSecretError ? { error: llmSecretError } : {})} hint="Only enabled LLM keys for this provider and Flow scope are listed. Secret values are never loaded here." label="Encrypted API key" onChange={(llmSecretKeyId) => updateDraft("llmSecretKeyId", llmSecretKeyId)} options={compatibleLlmSecrets.map((key) => ({ value: key.id, label: key.name, description: key.scope === "flow" ? "This Flow" : "Global" }))} placeholder={llmSecretsLoading ? "Loading encrypted keys" : "Choose an encrypted key"} value={draft.llmSecretKeyId} /><a className="button" href="/programs/secret-keys">Manage Keys</a></div>}
          {llmSecretsError ? <div className="automation-settings-inline-notice error" role="alert"><AlertCircle size={16} aria-hidden /><span>{llmSecretsError}</span><a href="/programs/secret-keys">Open Key Manager</a></div> : null}
          {!llmSecretsLoading && !llmSecretsError && draft.llmProvider !== "host" && draft.llmProvider !== "ollama" && !compatibleLlmSecrets.length ? <div className="automation-settings-inline-notice warning"><AlertTriangle size={16} aria-hidden /><span>No enabled {selectedProvider.label} key is available for this Flow.</span><a href="/programs/secret-keys">Add Key</a></div> : null}
        </section>
      <section className="automation-settings-panel automation-settings-panel-wide automation-settings-effective" id="flow-settings-effective">
        <header><strong>Effective Values</strong><span>What this Flow will use after framework defaults and Flow overrides are resolved</span></header>
        <div className="automation-settings-inline-notice"><Info size={16} aria-hidden /><span>This installation has framework defaults and Flow overrides. No project-default settings layer is configured.</span></div>
        <div className="automation-settings-effective-list">{effectiveSettings.map((setting) => <div className="automation-settings-effective-row" key={setting.key}><span>{setting.group}</span><div><strong>{setting.label}</strong><small>{setting.value}</small></div><StatusBadge value={setting.source} />{setting.resettable ? <button className="button" onClick={() => resetEffectiveSetting(setting.key)} type="button">Use Default</button> : <span />}</div>)}</div>
        <JsonToggle label="Show Technical Metadata" value={metadata} />
      </section>
      </SettingsSectionLayout>}
      {!settingsPending && !settingsLoadError ? <footer className="automation-settings-form-footer"><span>{draftDirty ? "Unsaved Flow settings" : "All Flow settings saved"}</span><div><button className="button" disabled={!draftDirty || saving} onClick={() => setDraft(baseDraft)} type="button">Discard Changes</button><button className="button button-primary" disabled={!props.projectId || !flow?.flowId || !draftDirty || saving} onClick={() => { if (settingsErrors.length) { setError("Fix the highlighted settings before saving."); return; } setError(""); setSaveAuthorizationPin(""); setSaveAuthorizationError(""); setSaveAuthorizationOpen(true); }} type="button">{saving ? "Saving..." : "Save Settings"}</button></div></footer> : null}
      {saveAuthorizationOpen ? <Modal title="Authorize Flow Settings Save" onClose={() => saving ? undefined : setSaveAuthorizationOpen(false)}><div className="automation-modal-form"><p className="automation-router-modal-intro">Confirm this Flow Settings write with your security PIN. Your draft remains intact if authorization or conflict checks fail.</p><Field label="Security PIN" {...(saveAuthorizationError ? { error: saveAuthorizationError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSaveAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveAuthorizationError(""); }} type="password" value={saveAuthorizationPin} /></Field><div className="modal-actions"><button className="button" disabled={saving} onClick={() => setSaveAuthorizationOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={saveAuthorizationPin.length < 4 || saving} onClick={() => void saveSettings(saveAuthorizationPin)} type="button">{saving ? "Saving..." : "Authorize and Save"}</button></div></div></Modal> : null}

    </section>
  );
}

function FlowPortSettingsEditor(props: { kind: "input" | "output"; ports: FlowPortSettingsDraft[]; onChange(ports: FlowPortSettingsDraft[]): void }) {
  const title = props.kind === "input" ? "Flow Inputs" : "Flow Outputs";
  const update = (index: number, patch: Partial<FlowPortSettingsDraft>) => props.onChange(props.ports.map((port, portIndex) => portIndex === index ? { ...port, ...patch } : port));
  const add = () => props.onChange([...props.ports, { id: `port.${props.kind}.${Date.now().toString(36)}`, name: "", valueKind: "string", required: false, description: "", defaultValue: "" }]);
  return <section className="automation-settings-panel automation-settings-panel-wide" id={`flow-settings-${props.kind}s`}><header><strong>{title}</strong><span>{props.kind === "input" ? "Values callers provide when starting this Flow" : "Values this Flow returns to its caller"}</span></header><div className="automation-flow-port-list">{props.ports.map((port, index) => <div className="automation-flow-port-row" key={port.id}><label><span>Name</span><input aria-invalid={!port.name.trim()} onChange={(event) => update(index, { name: event.target.value })} placeholder={props.kind === "input" ? "Customer email" : "Result"} value={port.name} /></label><label><span>Type</span><select onChange={(event) => update(index, { valueKind: event.target.value as FlowPortSettingsDraft["valueKind"], defaultValue: "" })} value={port.valueKind}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="json">Structured value</option></select></label>{port.valueKind === "boolean" ? <label><span>Default</span><select onChange={(event) => update(index, { defaultValue: event.target.value })} value={port.defaultValue}><option value="">No default</option><option value="true">Yes</option><option value="false">No</option></select></label> : <label><span>Default</span><input onChange={(event) => update(index, { defaultValue: event.target.value })} placeholder="No default" type={port.valueKind === "number" ? "number" : "text"} value={port.defaultValue} /></label>}<label className="automation-flow-port-description"><span>Description</span><input onChange={(event) => update(index, { description: event.target.value })} placeholder="How this value is used" value={port.description} /></label><label className="automation-flow-port-required"><input checked={port.required} disabled={props.kind === "output"} onChange={(event) => update(index, { required: event.target.checked })} type="checkbox" /><span>Required</span></label><button aria-label={`Remove ${props.kind} ${port.name || index + 1}`} className="automation-icon-button" onClick={() => props.onChange(props.ports.filter((_, portIndex) => portIndex !== index))} title={`Remove ${props.kind}`} type="button"><Trash2 size={15} aria-hidden /></button></div>)}{!props.ports.length ? <div className="automation-runtime-empty">No {props.kind}s defined.</div> : null}</div><button className="automation-runtime-row-action" onClick={add} type="button"><Plus size={14} aria-hidden />Add {props.kind}</button></section>;
}
function SettingsToggle(props: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return <label className="automation-settings-toggle"><input checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} type="checkbox" /><span>{props.label}</span></label>;
}

export * from "./flow-settings-model";
