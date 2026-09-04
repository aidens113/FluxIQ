import type { AutomationSelection } from "../shared/selection-contracts";
import { buildRecordingEventInspectorSections } from "../recordings";
import { callFlowInspectorRows, flowSourcePath, inspectorPortSummary, listRows, nodeConditionSections, adaptationChangeArray, adaptationChangeEvidenceRows, adaptationChangeRows } from "./panel-helpers";
import type { InspectorPanelBuilder, InspectorPanelContext, InspectorPanelModel, InspectorPanelRegistry, InspectorRow, InspectorSectionModel } from "./types";

const registry: InspectorPanelRegistry = {
  workspace: (context) => ({
    sections: [{ title: "Workspace Selection", rows: [["Object", context.selection.id === "clients" ? "Connected Clients" : "Runs"], ["Scope", "Current project"]] }]
  }),
  flow: (context) => ({
    sections: [
      { title: "Flow Identity", rows: [["Name", context.flow?.name ?? "-"], ["ID", context.flow?.flowId ?? context.selection.id], ["Scope", context.flow?.scope?.kind === "domain" ? `domain:${context.flow.scope.domainId}` : "global"], ["Origin", context.flow?.origin ?? "-"], ["Source owner", context.flow?.source?.mode ?? "legacy"], ["Source file", flowSourcePath(context.flow)], ["Visibility", context.flow?.visibility ?? "private"]] },
      { title: "Interface", rows: [["Inputs", String(context.flow?.interface?.inputs?.length ?? 0)], ["Outputs", String(context.flow?.interface?.outputs?.length ?? 0)], ["Errors", String(context.flow?.errors?.length ?? 0)], ["Variables", String(context.flow?.variables?.length ?? 0)]] },
      { title: "Publication and Dependencies", rows: [["Current state", context.flow?.publication?.status ?? "draft"], ["Published versions", String(context.flowPublicationCount)], ["Dependencies", String(context.flowDependencies.dependencies)], ["Used by", String(context.flowDependencies.usedBy)], ["Available upgrades", String(context.flowDependencies.availableUpgrades)], ["Compatibility warnings", String(context.flow?.metadata?.recordingProposalWarnings?.length ?? 0)]] }
    ]
  }),
  policy: (context) => ({
    sections: [
      { title: "Flow Graph", rows: [["Graph ID", context.policy?.policyId ?? context.selection.id], ["Task", context.policy?.taskId ?? "-"], ["Version", context.policy?.version ?? "-"], ["Nodes", String(context.policy?.nodes?.length ?? 0)], ["Edges", String(context.policy?.edges?.length ?? 0)]] },
      { title: "Validation", rows: [["Schema", "Ready"], ["Graph", "Check missing references"], ["Portability", "Domain-neutral contracts"]] }
    ]
  }),
  node: (context) => ({ sections: context.node ? nodeConditionSections(context.node) : [] }),
  "editor-node": (context) => {
    if (context.selection.kind !== "editor-node" || !context.node) return { sections: [] };
    const metadata = context.node.metadata ?? {};
    const sections: InspectorSectionModel[] = [{ title: "Metadata", rows: [["Node", context.node.label], ["ID", context.node.id], ["Type", context.node.nodeType ?? "-"], ["Family", context.node.family ?? "-"], ["Description", context.node.customDescription ?? context.node.description ?? "-"]] as InspectorRow[] }];
    if (metadata.proposalStep) sections.push({ title: "Adaptation Change", rows: adaptationChangeRows(metadata.proposalStep) });
    for (const [title, key] of [["Actions", "actions"], ["Requirements", "requirements"], ["Expected Result", "expectedEffects"]] as const) {
      const values = adaptationChangeArray(metadata.proposalStep?.[key]);
      if (values.length) sections.push({ title, rows: listRows(values) });
    }
    const evidence = adaptationChangeEvidenceRows(metadata.proposalStep?.evidence);
    if (evidence.length) sections.push({ title: "Evidence", rows: evidence });
    if (metadata["fluxiq.callFlow"]) sections.push({ title: "Pinned Call Flow", rows: callFlowInspectorRows(metadata["fluxiq.callFlow"]) });
    sections.push({ title: "Ports", rows: [["Inputs", inspectorPortSummary(context.node.inputs)], ["Outputs", inspectorPortSummary(context.node.outputs)], ["Privileged", context.node.privileged ? "Yes" : "No"], ["Actions", (context.node.actionTypes ?? []).join(", ") || "-"]] });
    return { sections };
  },
  "editor-mode": (context) => {
    if (context.selection.kind !== "editor-mode") return { sections: [] };
    return {
      sections: [
        { title: "Mode", rows: [["Editor", context.selection.editor === "flow" ? "Flow editor" : "Routine editor"], ["Compatibility source", context.selection.editor === "flow" ? "Canonical Flow / imported graph adapter" : "Legacy orchestration"], ["Mode", context.selection.label], ["Purpose", context.selection.description]] },
        ...context.selection.sections
      ]
    };
  },
  recording: (context) => ({
    sections: context.recording ? [{ title: "Recording Metadata", rows: [["Recording", context.recording.recordingId], ["Task", context.recording.taskId ?? "-"], ["Environment", context.recording.environment?.label ?? "-"], ["Entries", String(context.recording.timeline?.length ?? 0)], ["Notes", String(context.recording.notes?.length ?? 0)]] }] : []
  }),
  timeline: (context) => ({
    sections: context.entry ? buildRecordingEventInspectorSections(context.entry, context.timelineEntries, context.recording) : []
  }),
  signal: (context) => ({
    sections: context.signal ? [
      { title: "General", rows: [["Path", context.signal.path], ["Type", context.signal.type], ["Weight", String(context.signal.defaultWeight)], ["Volatility", context.signal.volatility], ["Registry", context.signal.registryId]] },
      { title: "Connections", rows: [["Used by nodes", "Linked through eligibility and success conditions"]] }
    ] : [],
    ...(context.signal ? { provenance: { current: String(context.signal.defaultWeight), source: "Signal registry default" } } : {})
  }),
  state: (context) => context.statePanel ?? { sections: [{ title: "State", rows: [["Selection", "Open State Explorer to load scoped state detail."]] }] }
};

export function buildInspectorPanel(context: InspectorPanelContext): InspectorPanelModel {
  const builder = registry[context.selection.kind] as InspectorPanelBuilder;
  return builder(context as never);
}

export const inspectorPanelKinds = Object.freeze(Object.keys(registry) as Array<AutomationSelection["kind"]>);
