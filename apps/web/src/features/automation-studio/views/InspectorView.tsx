"use client";

import { Check, Copy, ExternalLink, ListChecks, Search } from "lucide-react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { JsonObject } from "../../programs/program-api";
import { createContext, useContext, useEffect, useState } from "react";
import { KeyValue, SummaryStrip } from "../../programs/shared-ui";
import type { AutomationInspectorWidget, AutomationSelection } from "../types";
import { formatAutomationPorts } from "../graph/ports";
import { buildTimelineInspectorSections, conditionSummary } from "../timeline/view-model";
import { AutomationNodeParameterEditor, type AutomationReferenceOptions } from "../parameters/ParameterEditor";
import { buildNodeStateViewModel } from "../state/view-model";
const InspectorFilterContext = createContext("");

export type AutomationInspectorIdentity = { title: string; label: string; id: string; breadcrumb: string[]; href?: string; openLabel?: string };

export function automationInspectorIdentity(selection: AutomationSelection | null, context: { flow?: any; node?: any; recording?: any; entry?: any; signal?: any }): AutomationInspectorIdentity | null {
  if (!selection) return null;
  const flowLabel = context.flow?.name ?? context.flow?.flowId;
  const labels: Partial<Record<AutomationSelection["kind"], string>> = {
    workspace: selection.id === "clients" ? "Connected Clients" : "Runs",
    flow: context.flow?.name ?? selection.id,
    policy: context.flow?.name ?? selection.id,
    proposal: "Legacy proposal",
    "proposal-step": selection.kind === "proposal-step" ? selection.step.label : "",
    node: context.node?.label ?? selection.id,
    "editor-node": selection.kind === "editor-node" ? selection.node.label : "",
    "editor-mode": selection.kind === "editor-mode" ? selection.label + " Mode" : "",
    recording: context.recording?.name ?? context.recording?.metadata?.name ?? selection.id,
    timeline: context.entry?.label ?? context.entry?.type ?? selection.id,
    signal: context.signal?.label ?? context.signal?.path ?? selection.id,
    state: selection.kind === "state" ? selection.factPath ?? selection.evidenceId ?? "State detail" : ""
  };
  const titles: Partial<Record<AutomationSelection["kind"], string>> = {
    workspace: "Workspace",
    flow: "Flow",
    policy: "Policy Graph",
    proposal: "Legacy Proposal",
    "proposal-step": "Legacy Proposal Step",
    node: "Node",
    "editor-node": "Editor Node",
    "editor-mode": "Editor Mode",
    recording: "Recording",
    timeline: "Timeline Entry",
    signal: "Signal",
    state: "State Detail"
  };
  let href: string | undefined;
  let openLabel: string | undefined;
  if (selection.kind === "flow") { href = "?view=flow-settings"; openLabel = "Open Flow Settings"; }
  else if (selection.kind === "policy" || selection.kind === "node" || selection.kind === "editor-mode") { href = "?view=flow-editor"; openLabel = "Open Nodes"; }
  else if (selection.kind === "recording") { href = "?view=recording-timeline&recordingId=" + encodeURIComponent(selection.id); openLabel = "Open Recording"; }
  else if (selection.kind === "timeline") { href = "?view=recording-timeline&timelineEntryId=" + encodeURIComponent(selection.id); openLabel = "Open Timeline"; }
  else if (selection.kind === "signal" || selection.kind === "state") { href = "?view=state-explorer"; openLabel = "Open State View"; }
  else if (selection.kind === "proposal" || selection.kind === "proposal-step") { href = "?view=proposal-workbench"; openLabel = "Open Legacy Proposal"; }
  else if (selection.kind === "workspace") { href = selection.id === "clients" ? "?view=client-gateway" : "?view=runs-history"; openLabel = selection.id === "clients" ? "Open Connected Clients" : "Open Runs"; }
  const label = String(labels[selection.kind] ?? selection.id);
  return {
    title: String(titles[selection.kind] ?? "Inspector"),
    label,
    id: selection.id,
    breadcrumb: [flowLabel, label].filter((value, index, values): value is string => typeof value === "string" && Boolean(value) && values.indexOf(value) === index),
    ...(href ? { href } : {}),
    ...(openLabel ? { openLabel } : {})
  };
}
export function AutomationInspector(props: { entries: any[]; selection: AutomationSelection | null; policy: any; policies: any[]; flow: any; flowPublications: any[]; flowDependencyInfo: any; node: any; nodeDefinitions: any[]; recording: any; entry: any; signal: any; pipelineArtifacts: any; selectedTimeline: any; recordings: any[]; timelines: any[]; runtimeSessions: any[]; signals: any[]; onOpenState(request: { nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; proposalId?: string; timelineEntryId?: string }): void; setSelection(selection: AutomationSelection): void }) {
  const identity = automationInspectorIdentity(props.selection, { flow: props.flow, node: props.node, recording: props.recording, entry: props.entry, signal: props.signal });
  const [searchQuery, setSearchQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const copySelectionId = async () => {
    if (!identity?.id) return;
    try {
      await navigator.clipboard.writeText(identity.id);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1_500);
    } catch {
      setCopyStatus("Copy failed");
    }
  };
  useEffect(() => setSearchQuery(""), [identity?.id]);
  const referenceOptions = automationInspectorReferenceOptions(props);
  const timelineInspector = props.selection?.kind === "timeline" && props.entry ? buildTimelineInspectorSections(props.entry, props.entries, props.recording) : [];
  const stateNodeId = inspectorStateNodeId(props.selection, props.node);
  const stateSelectionValue = props.selection?.kind === "state" ? props.selection : null;
  const stateInspector = stateSelectionValue ? buildNodeStateViewModel({
    selection: stateSelectionValue,
    selectedNode: props.node,
    selectedRecording: props.recording,
    selectedTimeline: props.selectedTimeline,
    policy: props.policy,
    taskGraph: props.flow,
    pipelineArtifacts: props.pipelineArtifacts,
    recordings: props.recordings,
    timelines: props.timelines,
    runtimeSessions: props.runtimeSessions,
    signals: props.signals,
    viewState: compactInspectorStateViewState({
      sourceId: stateSelectionValue.sourceId,
      phase: stateSelectionValue.phase,
      selectedEvidenceId: stateSelectionValue.evidenceId,
      selectedFactPath: stateSelectionValue.factPath
    })
  }) : null;
  const selectedStateEvidence = stateInspector && stateSelectionValue?.evidenceId ? stateInspector.evidence.find((item) => item.id === stateSelectionValue.evidenceId) : undefined;
  const selectedStateFact = stateInspector && stateSelectionValue?.factPath ? stateInspector.facts.find((item) => item.fullPath === stateSelectionValue.factPath) : undefined;
  const selectedStateEntity = selectedStateFact ? stateEntityFromFact(selectedStateFact) : undefined;
  const updateEditorNodeParameters = (parameterValues: JsonObject) => {
    if (props.selection?.kind !== "editor-node") return;
    const nextSelection: AutomationSelection = {
      ...props.selection,
      node: {
        ...props.selection.node,
        parameterValues
      }
    };
    props.setSelection(nextSelection);
    window.dispatchEvent(new CustomEvent("automation-studio:update-node-parameters", { detail: { nodeId: props.selection.id, parameterValues } }));
  };
  const updateEditorNodeDescription = (customDescription: string) => {
    if (props.selection?.kind !== "editor-node") return;
    const nextSelection: AutomationSelection = {
      ...props.selection,
      node: {
        ...props.selection.node,
        customDescription
      }
    };
    props.setSelection(nextSelection);
    window.dispatchEvent(new CustomEvent("automation-studio:update-node-parameters", { detail: { nodeId: props.selection.id, customDescription } }));
  };
  return (
    <aside className="automation-inspector">
      <header className="automation-inspector-identity">
        <span>Inspector</span>
        <strong>{identity?.title ?? "No selection"}</strong>
        {identity ? <small>{identity.label}</small> : null}
        {identity?.breadcrumb.length ? <nav aria-label="Selected object path">{identity.breadcrumb.map((item, index) => <span key={item}>{index ? " / " : ""}{item}</span>)}</nav> : null}
      </header>
      {identity ? <div className="automation-inspector-tools">
        <button aria-label="Copy selected object ID" className="button" onClick={() => void copySelectionId()} title="Copy selected object ID" type="button">{copyStatus === "Copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copyStatus || "Copy ID"}</button>
        {identity.href && identity.openLabel ? <a className="button" href={identity.href}><ExternalLink size={14} aria-hidden />{identity.openLabel}</a> : null}
      </div> : null}
      <div className="automation-inspector-search">
        <Search size={14} aria-hidden />
        <input aria-label="Search inspector fields" disabled={!identity} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search fields" type="search" value={searchQuery} />
      </div>
      {!identity ? <div className="automation-inspector-empty"><Search size={22} aria-hidden /><strong>Select an object to inspect</strong><span>Choose a Flow, node, route, recording, event, run, state fact, or other workspace object.</span></div> : <InspectorFilterContext.Provider value={searchQuery}><>
      {searchQuery ? <p className="automation-inspector-filter-status">Showing fields matching <strong>{searchQuery}</strong></p> : null}
      {stateNodeId ? <button className="button automation-inspector-action" onClick={() => props.onOpenState({ nodeId: stateNodeId, ...(props.selection?.kind === "proposal-step" ? { proposalId: props.selection.proposalId } : {}), phase: "input" })} type="button"><ListChecks size={14} aria-hidden />Open State</button> : null}
      {props.selection?.kind === "state" && stateInspector ? <>
        {selectedStateEntity ? <InspectorSection title="Selected State Entity" rows={[
          ["Entity", selectedStateEntity.label],
          ["Entity path", selectedStateEntity.path],
          ["Entity type", selectedStateEntity.type],
          ["Anchor", selectedStateFact?.anchor ? stateAnchorSummary(selectedStateFact.anchor) : "-"],
          ["Source", selectedStateFact?.source ?? "-"]
        ]} /> : null}
        {selectedStateFact ? <InspectorSection title="Selected State Fact" rows={[
          ["Fact label", selectedStateFact.label],
          ["Attribute", selectedStateEntity?.attribute ?? selectedStateFact.label],
          ["Fact path", selectedStateFact.fullPath],
          ["Value", selectedStateFact.value],
          ["Observed", selectedStateFact.observedAt !== undefined ? String(selectedStateFact.observedAt) : "-"],
          ["Confidence", formatInspectorNumber(selectedStateFact.confidence)]
        ]} /> : null}
        {selectedStateEvidence ? <InspectorSection title="Selected Node Evidence" rows={[
          ["Label", selectedStateEvidence.label],
          ["Role", selectedStateEvidence.role],
          ["Fact", selectedStateEvidence.factPath],
          ["Comparator", selectedStateEvidence.comparator],
          ["Expected", selectedStateEvidence.expectedValue ?? "-"],
          ["Weight", formatInspectorNumber(selectedStateEvidence.weight)],
          ["Confidence", formatInspectorNumber(selectedStateEvidence.confidence)],
          ["Provenance", String(selectedStateEvidence.provenanceCount)]
        ]} /> : null}
        <InspectorSection title="State Selection" rows={[
          ["Source", stateInspector.activeSource ? `${stateInspector.activeSource.label} (${stateInspector.activeSource.id})` : "-"],
          ["Phase", stateInspector.activePhase],
          ["Facts", String(stateInspector.summary.facts)],
          ["Evidence", String(stateInspector.summary.evidence)],
          ["Selected fact", props.selection.factPath ?? "-"],
          ["Selected evidence", props.selection.evidenceId ?? "-"]
        ]} />
        {!selectedStateEvidence && !selectedStateFact ? <InspectorSection title="State" rows={[["Selection", "Click a bbox or structured fact to inspect it here."], ["Active source", stateInspector.activeSource?.id ?? "-"]]} /> : null}
      </> : null}
      {props.selection?.kind === "editor-mode" ? <>
        <InspectorSection title="Mode" rows={[["Editor", props.selection.editor === "flow" ? "Flow editor" : "Routine editor"], ["Compatibility source", props.selection.editor === "flow" ? "Canonical Flow / legacy policy adapter" : "Legacy orchestration"], ["Mode", props.selection.label], ["Purpose", props.selection.description]]} />
        {props.selection.widgets?.map((widget, widgetIndex) => <InspectorWidget key={`${widget.kind}:${widget.title}:${widgetIndex}`} widget={widget} />)}
        {props.selection.sections.map((section, sectionIndex) => <InspectorSection key={`${section.title}:${sectionIndex}`} title={section.title} rows={section.rows} />)}
      </> : null}
      {props.selection?.kind === "proposal-step" ? <>
        <InspectorSection title="Legacy Proposal Step" rows={[
          ["Editing", "Read-only compatibility detail"],
          ["Confidence", props.selection.step.confidence],
          ["Event", props.selection.step.label],
          ["Transition", props.selection.step.transition ?? "-"],
          ["Occurrences", props.selection.step.occurrenceCount > 1 ? `${props.selection.step.occurrenceCount} grouped occurrences` : "1 occurrence"],
          ["Description", props.selection.step.occurrenceCount > 1 ? `${props.selection.step.occurrenceCount} similar recorded occurrences were grouped into this proposed step.` : props.selection.step.description]
        ]} />
        <InspectorSection title="Actions" rows={listRows(props.selection.step.actions)} />
        {props.selection.step.requirements.length ? <InspectorSection title="Requirements" rows={listRows(props.selection.step.requirements)} /> : null}
        {props.selection.step.expectedEffects.length ? <InspectorSection title="Expected Result" rows={listRows(props.selection.step.expectedEffects)} /> : null}
        {props.selection.step.evidence.length ? <InspectorSection title="Evidence" rows={props.selection.step.evidence.map((signal) => [signal.title, signal.relation])} /> : null}
      </> : null}
      {props.selection?.kind === "signal" && props.signal ? <>
        <InspectorSection title="General" rows={[["Path", props.signal.path], ["Type", props.signal.type], ["Weight", String(props.signal.defaultWeight)], ["Volatility", props.signal.volatility], ["Registry", props.signal.registryId]]} />
        <InspectorSection title="Connections" rows={[["Used by nodes", "Linked through eligibility and success conditions"]]} />
        <InspectorProvenance current={String(props.signal.defaultWeight)} source="Signal registry default" />
      </> : null}
      {props.selection?.kind === "timeline" && props.entry ? timelineInspector.map((section) => <InspectorSection key={section.title} title={section.title} rows={section.rows} />) : null}
      {props.selection?.kind === "recording" && props.recording ? <>
        <InspectorSection title="Recording Metadata" rows={[["Recording", props.recording.recordingId], ["Task", props.recording.taskId ?? "-"], ["Environment", props.recording.environment?.label ?? "-"], ["Entries", String(props.recording.timeline?.length ?? 0)], ["Notes", String(props.recording.notes?.length ?? 0)]]} />
      </> : null}
      {props.selection?.kind === "editor-node" && props.node ? <>
        <AutomationNodeParameterEditor node={props.node} referenceOptions={referenceOptions} onChange={updateEditorNodeParameters} onDescriptionChange={updateEditorNodeDescription} />
        <InspectorSection title="Metadata" rows={[["Node", props.node.label], ["ID", props.node.id], ["Type", props.node.nodeType ?? "-"], ["Family", props.node.family ?? "-"], ["Default description", props.node.description ?? "-"]]} />
        {props.node.metadata?.proposalStep ? <InspectorSection title="Proposal Step" rows={proposalStepRows(props.node.metadata.proposalStep)} /> : null}
        {proposalStepArray(props.node.metadata?.proposalStep?.actions).length ? <InspectorSection title="Actions" rows={listRows(proposalStepArray(props.node.metadata.proposalStep.actions))} /> : null}
        {proposalStepArray(props.node.metadata?.proposalStep?.requirements).length ? <InspectorSection title="Requirements" rows={listRows(proposalStepArray(props.node.metadata.proposalStep.requirements))} /> : null}
        {proposalStepArray(props.node.metadata?.proposalStep?.expectedEffects).length ? <InspectorSection title="Expected Result" rows={listRows(proposalStepArray(props.node.metadata.proposalStep.expectedEffects))} /> : null}
        {proposalStepEvidenceRows(props.node.metadata?.proposalStep?.evidence).length ? <InspectorSection title="Evidence" rows={proposalStepEvidenceRows(props.node.metadata.proposalStep.evidence)} /> : null}
        {props.node.metadata?.["fluxiq.callFlow"] ? <InspectorSection title="Pinned Call Flow" rows={callFlowInspectorRows(props.node.metadata["fluxiq.callFlow"])} /> : null}
        <InspectorSection title="Ports" rows={[["Inputs", formatAutomationPorts(props.node.inputs)], ["Outputs", formatAutomationPorts(props.node.outputs)], ["Privileged", props.node.privileged ? "Yes" : "No"], ["Actions", (props.node.actionTypes ?? []).join(", ") || "-"]]} />
      </> : null}
      {props.selection?.kind === "flow" && props.flow ? <>
        <InspectorSection title="Flow Identity" rows={[["Name", props.flow.name], ["ID", props.flow.flowId], ["Scope", props.flow.scope?.kind === "domain" ? `domain:${props.flow.scope.domainId}` : "global"], ["Origin", props.flow.origin ?? "-"], ["Source owner", props.flow.source?.mode ?? "legacy"], ["Source file", flowSourcePath(props.flow)], ["Visibility", props.flow.visibility ?? "private"]]} />
        <InspectorSection title="Interface" rows={[["Inputs", String(props.flow.interface?.inputs?.length ?? 0)], ["Outputs", String(props.flow.interface?.outputs?.length ?? 0)], ["Errors", String(props.flow.errors?.length ?? 0)], ["Variables", String(props.flow.variables?.length ?? 0)]]} />
        <InspectorSection title="Publication and Dependencies" rows={[["Current state", props.flow.publication?.status ?? "draft"], ["Published versions", String(props.flowPublications.length)], ["Dependencies", String(props.flowDependencyInfo?.dependencies?.length ?? 0)], ["Used by", String(props.flowDependencyInfo?.usedBy?.length ?? 0)], ["Available upgrades", String(props.flowDependencyInfo?.availableUpgrades?.length ?? 0)], ["Compatibility warnings", String(props.flow.metadata?.recordingProposalWarnings?.length ?? 0)]]} />
      </> : null}
      {(!props.selection || props.selection.kind === "node") && props.node ? <>
        <InspectorSection title="General" rows={[["Node", props.node.label], ["ID", props.node.id], ["Actions", (props.node.actions ?? []).map((action: any) => action.actionType).join(", ")], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
        <InspectorSection title="Conditions" rows={[["Eligibility", conditionSummary(props.node.eligibility)], ["Readiness", conditionSummary(props.node.readinessConditions)], ["Success", conditionSummary(props.node.successConditions)]]} />
        <InspectorSection title="Timing and Retries" rows={[["Timeout", props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"], ["Retry", props.node.retry?.strategy ?? "Default"], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
      </> : null}
      {props.selection?.kind === "policy" && props.policy ? <>
        <InspectorSection title="Policy" rows={[["Policy", props.policy.policyId], ["Task", props.policy.taskId], ["Version", props.policy.version], ["Nodes", String(props.policy.nodes?.length ?? 0)], ["Edges", String(props.policy.edges?.length ?? 0)]]} />
        <InspectorSection title="Validation" rows={[["Schema", "Ready"], ["Graph", "Check missing references"], ["Portability", "Domain-neutral contracts"]]} />
      </> : null}
      {props.selection?.kind === "proposal" ? <InspectorSection title="Legacy Proposal" rows={[["ID", props.selection.id], ["Status", "Read-only compatibility object"], ["Current review surface", "Adaptations"]]} /> : null}
      {props.selection?.kind === "workspace" ? <InspectorSection title="Workspace Selection" rows={[["Object", props.selection.id === "clients" ? "Connected Clients" : "Runs"], ["Scope", "Current project"]]} /> : null}
      </></InspectorFilterContext.Provider>}
    </aside>
  );
}

export function automationInspectorReferenceOptions(props: {
  flow: any;
  nodeDefinitions: any[];
  policies: any[];
  pipelineArtifacts: any;
}): AutomationReferenceOptions {
  const pipeline = props.pipelineArtifacts ?? {};
  const option = (id: unknown, label: unknown, detail?: unknown) => ({
    id: String(id ?? ""),
    label: String(label ?? id ?? "Unnamed"),
    ...(detail ? { detail: String(detail) } : {})
  });
  const actions = props.nodeDefinitions
    .filter((definition) => definition?.outputAction || definition?.safety?.privileged || definition?.category === "policy")
    .map((definition) => option(definition.id, definition.label, definition.description));
  const tasks = [...(pipeline.tasks ?? []), ...(pipeline.learnedTaskModels ?? [])]
    .map((task: any) => option(task.taskId ?? task.id, task.name ?? task.label ?? task.taskId, task.description));
  const policies = [...(props.policies ?? []), ...(pipeline.policyGraphs ?? [])]
    .map((policy: any) => option(policy.policyId ?? policy.id, policy.name ?? policy.label ?? policy.policyId, policy.version));
  const routines = (pipeline.routines ?? [])
    .map((routine: any) => option(routine.routineId ?? routine.id, routine.name ?? routine.label ?? routine.routineId, routine.description));
  const collections = [...(pipeline.databaseCollections ?? []), ...(pipeline.collections ?? [])]
    .map((collection: any) => option(collection.collectionId ?? collection.id ?? collection.name, collection.label ?? collection.name ?? collection.id, collection.description));
  const variables = (props.flow?.variables ?? [])
    .map((variable: any) => typeof variable === "string" ? option(variable, variable) : option(variable.id ?? variable.name, variable.label ?? variable.name ?? variable.id, variable.description));
  return {
    action: uniqueReferenceOptions(actions),
    task: uniqueReferenceOptions(tasks),
    policy: uniqueReferenceOptions(policies),
    routine: uniqueReferenceOptions(routines),
    "database-collection": uniqueReferenceOptions(collections),
    variable: uniqueReferenceOptions(variables)
  };
}

function uniqueReferenceOptions(options: Array<{ id: string; label: string; detail?: string }>) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.id || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}
export function InspectorSection(props: { title: string; rows: Array<[string, string]> }) {
  const query = useContext(InspectorFilterContext).trim().toLocaleLowerCase();
  const rows = query
    ? props.rows.filter(([label, value]) => (props.title + " " + label + " " + value).toLocaleLowerCase().includes(query))
    : props.rows;
  if (query && rows.length === 0) return null;
  return (
    <details className="automation-inspector-section" open>
      <summary>{props.title}</summary>
      <KeyValue rows={rows} />
    </details>
  );
}

function InspectorWidget(props: { widget: AutomationInspectorWidget }) {
  const query = useContext(InspectorFilterContext).trim().toLocaleLowerCase();
  const titleMatches = props.widget.title.toLocaleLowerCase().includes(query);
  if (props.widget.kind === "summary") {
    const items = query && !titleMatches
      ? props.widget.items.filter(([label, value]) => (label + " " + value).toLocaleLowerCase().includes(query))
      : props.widget.items;
    if (query && items.length === 0) return null;
    return (
      <section className="automation-inspector-widget">
        <strong>{props.widget.title}</strong>
        <SummaryStrip items={items} />
      </section>
    );
  }
  const items = query && !titleMatches
    ? props.widget.items.filter((item) => Object.values(item).some((value) => String(value ?? "").toLocaleLowerCase().includes(query)))
    : props.widget.items;
  if (query && items.length === 0) return null;
  return (
    <section className="automation-inspector-widget">
      <strong>{props.widget.title}</strong>
      <div className="automation-inspector-card-list">
        {items.map((item) => (
          <article key={item.title + ":" + (item.meta ?? "")}>
            <span>{item.meta ?? "Item"}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function listRows(items: string[]): Array<[string, string]> {
  return items.length ? items.map((item, index) => [String(index + 1), item]) : [["Items", "-"]];
}

function compactInspectorStateViewState(value: { sourceId?: string | undefined; phase?: NodeStatePhase | undefined; selectedEvidenceId?: string | undefined; selectedFactPath?: string | undefined }) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { sourceId?: string; phase?: NodeStatePhase; selectedEvidenceId?: string; selectedFactPath?: string };
}

function formatInspectorNumber(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(2);
}

function stateAnchorSummary(anchor: any): string {
  if (!anchor || typeof anchor !== "object") return "-";
  if (anchor.type === "bounds" && anchor.bounds) {
    const bounds = anchor.bounds;
    return `bounds ${bounds.x ?? 0}, ${bounds.y ?? 0}, ${bounds.width ?? 0} x ${bounds.height ?? 0}${anchor.boundsKind ? ` (${anchor.boundsKind})` : ""}`;
  }
  if (anchor.type === "point") return `point ${anchor.x ?? 0}, ${anchor.y ?? 0}`;
  return String(anchor.type ?? "-");
}

function stateEntityFromFact(fact: { namespace: string; path: string; fullPath: string; label: string; anchor?: any }): { label: string; path: string; type: string; attribute: string } {
  const segments = fact.path.split(".").filter(Boolean);
  const collection = segments[0] ?? "state";
  const entityId = segments[1];
  const entityPath = entityId ? `${fact.namespace}.${collection}.${entityId}` : fact.namespace;
  const attribute = entityId && segments.length > 2 ? segments.slice(2).join(".") : segments.slice(1).join(".") || fact.path;
  const anchorType = typeof fact.anchor?.type === "string" ? fact.anchor.type : "";
  const type = anchorType === "entity" || anchorType === "region" ? titleCase(anchorType) : titleCase(singularize(collection));
  const label = entityId ? titleCase(entityId.replace(/[-_]/g, " ")) : fact.label;
  return { label, path: entityPath, type, attribute };
}

function singularize(value: string): string {
  return value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.endsWith("s") ? value.slice(0, -1) : value;
}

function titleCase(value: string): string {
  return value.split(/[\s.]+/).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || "-";
}

function callFlowInspectorRows(value: any): Array<[string, string]> {
  const target = value?.target ?? {};
  return [["Flow", String(target.flowId ?? "-")], ["Version", String(target.version ?? "-")], ["Scope", target.scope?.kind === "domain" ? `domain:${target.scope.domainId}` : String(target.scope?.kind ?? "-")], ["Inputs", String(value?.inputBindings?.length ?? 0)], ["Outputs", String(value?.outputBindings?.length ?? 0)], ["Error routes", String(value?.errorBindings?.length ?? 0)]];
}

function proposalStepRows(value: any): Array<[string, string]> {
  if (!value || typeof value !== "object") return [];
  return [
    ["Confidence", String(value.confidence ?? "-")],
    ["Event", String(value.label ?? "-")],
    ["Transition", String(value.transition ?? "-")],
    ["Occurrences", Number(value.occurrenceCount ?? 1) > 1 ? `${value.occurrenceCount} grouped occurrences` : "1 occurrence"],
    ["Description", String(value.description ?? "-")]
  ];
}

function proposalStepArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function proposalStepEvidenceRows(value: unknown): Array<[string, string]> {
  if (!Array.isArray(value)) return [];
  return value.map((signal: any) => [String(signal.title ?? signal.id ?? "Evidence"), String(signal.relation ?? "-")]);
}

function flowSourcePath(flow: any): string {
  if (flow?.source?.mode === "code" && flow.source.moduleId) return `source/${flow.source.moduleId}`;
  return flow?.metadata?.generatedSource?.relativePath ?? (flow?.flowId ? `source/flows/${flow.flowId}.flow.ts` : "-");
}

function inspectorStateNodeId(selection: AutomationSelection | null, node: any): string {
  if (selection?.kind === "editor-node" || selection?.kind === "node") return selection.id;
  if (selection?.kind === "proposal-step") return typeof node?.id === "string" ? node.id : selection.id;
  if (selection?.kind === "state" && selection.nodeId) return selection.nodeId;
  return typeof node?.id === "string" ? node.id : "";
}

function InspectorProvenance(props: { current: string; source: string }) {
  return (
    <section className="automation-provenance-card">
      <strong>Value Provenance</strong>
      <span>Current: {props.current}</span>
      <small>{props.source}</small>
    </section>
  );
}
