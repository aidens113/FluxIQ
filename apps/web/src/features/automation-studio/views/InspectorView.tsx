"use client";

import { Search } from "lucide-react";
import type { JsonObject } from "../../programs/program-api";
import { KeyValue } from "../../programs/shared-ui";
import type { AutomationSelection } from "../types";
import { formatAutomationPorts } from "../graph/ports";
import { buildTimelineInspectorSections, conditionSummary } from "../timeline/view-model";
import { AutomationNodeParameterEditor } from "../parameters/ParameterEditor";
export function AutomationInspector(props: { entries: any[]; selection: AutomationSelection | null; policy: any; node: any; recording: any; entry: any; signal: any; setSelection(selection: AutomationSelection): void }) {
  const title = props.selection?.kind === "signal" ? "Signal" : props.selection?.kind === "timeline" ? "Timeline Entry" : props.selection?.kind === "recording" ? "Recording" : props.selection?.kind === "policy" ? "Policy Graph" : props.selection?.kind === "editor-node" ? "Editor Node" : props.selection?.kind === "editor-mode" ? `${props.selection.label} Mode` : "Node Inspector";
  const timelineInspector = props.selection?.kind === "timeline" && props.entry ? buildTimelineInspectorSections(props.entry, props.entries, props.recording) : [];
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
      <header>
        <span>Inspector</span>
        <strong>{title}</strong>
      </header>
      <div className="automation-inspector-search">
        <Search size={14} aria-hidden />
        <input aria-label="Search inspector fields" placeholder="Search fields" />
      </div>
      {props.selection?.kind === "editor-mode" ? <>
        <InspectorSection title="Mode" rows={[["Editor", props.selection.editor === "task" ? "Task editor" : "Routine editor"], ["Mode", props.selection.label], ["Purpose", props.selection.description]]} />
        {props.selection.sections.map((section, sectionIndex) => <InspectorSection key={`${section.title}:${sectionIndex}`} title={section.title} rows={section.rows} />)}
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
        <InspectorSection title="Ports" rows={[["Inputs", formatAutomationPorts(props.node.inputs)], ["Outputs", formatAutomationPorts(props.node.outputs)], ["Privileged", props.node.privileged ? "Yes" : "No"], ["Actions", (props.node.actionTypes ?? []).join(", ") || "-"]]} />
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

function InspectorProvenance(props: { current: string; source: string }) {
  return (
    <section className="automation-provenance-card">
      <strong>Value Provenance</strong>
      <span>Current: {props.current}</span>
      <small>{props.source}</small>
    </section>
  );
}
