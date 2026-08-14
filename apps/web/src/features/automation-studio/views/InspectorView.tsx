"use client";

import { ListChecks, Search } from "lucide-react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { JsonObject } from "../../programs/program-api";
import { KeyValue, SummaryStrip } from "../../programs/shared-ui";
import type { AutomationInspectorWidget, AutomationSelection } from "../types";
import { formatAutomationPorts } from "../graph/ports";
import { buildTimelineInspectorSections, conditionSummary } from "../timeline/view-model";
import { AutomationNodeParameterEditor } from "../parameters/ParameterEditor";
export function AutomationInspector(props: { entries: any[]; selection: AutomationSelection | null; policy: any; flow: any; flowPublications: any[]; flowDependencyInfo: any; node: any; recording: any; entry: any; signal: any; onOpenState(request: { nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; proposalId?: string; timelineEntryId?: string }): void; setSelection(selection: AutomationSelection): void }) {
  const title = props.selection?.kind === "flow" ? "Flow" : props.selection?.kind === "signal" ? "Signal" : props.selection?.kind === "timeline" ? "Timeline Entry" : props.selection?.kind === "recording" ? "Recording" : props.selection?.kind === "policy" ? "Policy Graph" : props.selection?.kind === "proposal-step" ? "Proposal Step" : props.selection?.kind === "editor-node" ? "Editor Node" : props.selection?.kind === "editor-mode" ? `${props.selection.label} Mode` : "Node Inspector";
  const timelineInspector = props.selection?.kind === "timeline" && props.entry ? buildTimelineInspectorSections(props.entry, props.entries, props.recording) : [];
  const stateNodeId = inspectorStateNodeId(props.selection, props.node);
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
  const updateProposalNode = (changes: { label?: string; customDescription?: string }) => {
    if (props.selection?.kind !== "proposal-step") return;
    const customDescription = changes.customDescription ?? props.selection.node?.customDescription;
    const nextSelection: AutomationSelection = {
      ...props.selection,
      node: {
        label: changes.label ?? props.selection.node?.label ?? props.selection.step.label,
        description: props.selection.node?.description ?? props.selection.step.description,
        ...(customDescription !== undefined ? { customDescription } : {})
      }
    };
    props.setSelection(nextSelection);
    window.dispatchEvent(new CustomEvent("automation-studio:update-proposal-node", { detail: { nodeId: props.selection.id, ...changes } }));
  };
  return (
    <aside className="automation-inspector">
      <header>
        <span>Inspector</span>
        <strong>{title}</strong>
      </header>
      <div className="automation-inspector-search">
        <Search size={14} aria-hidden />
        <input aria-label="Search inspector fields" placeholder="Search fields" />
      </div>
      {stateNodeId ? <button className="button automation-inspector-action" onClick={() => props.onOpenState({ nodeId: stateNodeId, ...(props.selection?.kind === "proposal-step" ? { proposalId: props.selection.proposalId } : {}), phase: "input" })} type="button"><ListChecks size={14} aria-hidden />Open State</button> : null}
      {props.selection?.kind === "editor-mode" ? <>
        <InspectorSection title="Mode" rows={[["Editor", props.selection.editor === "flow" ? "Flow editor" : "Routine editor"], ["Compatibility source", props.selection.editor === "flow" ? "Canonical Flow / legacy policy adapter" : "Legacy orchestration"], ["Mode", props.selection.label], ["Purpose", props.selection.description]]} />
        {props.selection.widgets?.map((widget, widgetIndex) => <InspectorWidget key={`${widget.kind}:${widget.title}:${widgetIndex}`} widget={widget} />)}
        {props.selection.sections.map((section, sectionIndex) => <InspectorSection key={`${section.title}:${sectionIndex}`} title={section.title} rows={section.rows} />)}
      </> : null}
      {props.selection?.kind === "proposal-step" ? <>
        <section className="automation-proposal-node-edit">
          <label><span>Node Label</span><input value={props.selection.node?.label ?? props.selection.step.label} onChange={(event) => updateProposalNode({ label: event.target.value })} /></label>
          <label><span>Description</span><textarea rows={3} value={props.selection.node?.customDescription ?? props.selection.node?.description ?? props.selection.step.description} onChange={(event) => updateProposalNode({ customDescription: event.target.value })} /></label>
        </section>
        <InspectorSection title="Proposal Step" rows={[
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
        <InspectorSection title="Connections" rows={[["Used by nodes", "Linked through eligibility and success conditions"], ["Relationship view", "Open in signal web"]]} />
        <InspectorProvenance current={String(props.signal.defaultWeight)} source="Signal registry default" />
      </> : null}
      {props.selection?.kind === "timeline" && props.entry ? timelineInspector.map((section) => <InspectorSection key={section.title} title={section.title} rows={section.rows} />) : null}
      {props.selection?.kind === "recording" && props.recording ? <>
        <InspectorSection title="Recording Metadata" rows={[["Recording", props.recording.recordingId], ["Task", props.recording.taskId ?? "-"], ["Environment", props.recording.environment?.label ?? "-"], ["Entries", String(props.recording.timeline?.length ?? 0)], ["Notes", String(props.recording.notes?.length ?? 0)]]} />
        <InspectorSection title="Dataset Actions" rows={[["Status", "Raw, normalized, mined"], ["Compare", "Align by semantic actions"], ["Reprocess", "Run normalization and mining"]]} />
      </> : null}
      {props.selection?.kind === "editor-node" && props.node ? <>
        <AutomationNodeParameterEditor node={props.node} onChange={updateEditorNodeParameters} onDescriptionChange={updateEditorNodeDescription} />
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
        <InspectorSection title="Runtime History" rows={[["Runs", "124"], ["Successes", "118"], ["Retries", "5"], ["Median duration", "1.7s"]]} />
        <InspectorSection title="Training" rows={[["Suggested adjustment", "Increase timeout when recent runs exceed observed median"], ["Risk", "Low"]]} />
        <InspectorProvenance current={props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"} source="Generated from recording evidence and editable by user" />
      </> : null}
      {props.selection?.kind === "policy" && props.policy ? <>
        <InspectorSection title="Policy" rows={[["Policy", props.policy.policyId], ["Task", props.policy.taskId], ["Version", props.policy.version], ["Nodes", String(props.policy.nodes?.length ?? 0)], ["Edges", String(props.policy.edges?.length ?? 0)]]} />
        <InspectorSection title="Validation" rows={[["Schema", "Ready"], ["Graph", "Check missing references"], ["Portability", "Domain-neutral contracts"]]} />
      </> : null}
    </aside>
  );
}

export function InspectorSection(props: { title: string; rows: Array<[string, string]> }) {
  return (
    <details className="automation-inspector-section" open>
      <summary>{props.title}</summary>
      <KeyValue rows={props.rows} />
    </details>
  );
}

function InspectorWidget(props: { widget: AutomationInspectorWidget }) {
  if (props.widget.kind === "summary") {
    return (
      <section className="automation-inspector-widget">
        <strong>{props.widget.title}</strong>
        <SummaryStrip items={props.widget.items} />
      </section>
    );
  }
  return (
    <section className="automation-inspector-widget">
      <strong>{props.widget.title}</strong>
      <div className="automation-inspector-card-list">
        {props.widget.items.map((item) => (
          <article key={`${item.title}:${item.meta ?? ""}`}>
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
  if (selection?.kind === "proposal-step") return selection.id;
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
