"use client";

import { useMemo, type ComponentProps } from "react";
import { AlertTriangle, Bug, FileSearch, GitBranch, ListChecks, Radio, SlidersHorizontal } from "lucide-react";
import { AdaptationsView } from "../adaptations/AdaptationsView";
import type { AdaptationsViewHostCommands, AdaptationsViewHostModel } from "../adaptations/adaptation-host";
import { ClientGatewayView } from "../clients/ClientGatewayView";
import { FlowEditorView } from "../flow-editor/FlowEditorView";
import { InspectorView } from "../inspector/InspectorView";
import { InstructionsView } from "../instructions/InstructionsView";
import type { InstructionsViewHostCommands, InstructionsViewHostModel } from "../instructions/instruction-host";
import { ProblemsView } from "../problems/ProblemsView";
import { RecordingTimelineView } from "../recordings/RecordingTimelineView";
import { RouterView } from "../router/RouterView";
import type { RouterViewHostCommands, RouterViewHostModel } from "../router/router-host";
import { FlowRunView } from "../runtime/FlowRunView";
import type { RuntimeViewHostCommands, RuntimeViewHostModel } from "../runtime/runtime-host";
import { SettingsView } from "../settings/SettingsViews";
import type { SettingsViewHostCommands, SettingsViewHostModel } from "../settings/settings-host";
import { StateExplorerView } from "../state/StateExplorerView";
import { SubflowsView } from "../subflows/SubflowsView";
import type { SubflowsViewHostCommands, SubflowsViewHostModel } from "../subflows/subflow-host";
import {
  defineAutomationStudioViews,
  defineAutomationViewHost,
  defineComponentAutomationViewHost,
  type AutomationStudioViewAvailability,
  type AutomationViewFunctionalityContract,
  type HostBindingOf
} from "./view-definition-types";

const emptyTimelines: never[] = [];

const clientsHost = defineComponentAutomationViewHost<ComponentProps<typeof ClientGatewayView>, "active">(
  () => ClientGatewayView,
  (activity) => ({ active: activity.active })
);
const flowEditorHost = defineComponentAutomationViewHost<ComponentProps<typeof FlowEditorView>, "activeRef">(
  () => FlowEditorView,
  (activity) => ({ activeRef: activity.activeRef })
);
const recordingTimelineHost = defineComponentAutomationViewHost<ComponentProps<typeof RecordingTimelineView>>(() => RecordingTimelineView);
const stateHost = defineComponentAutomationViewHost<ComponentProps<typeof StateExplorerView>>(() => StateExplorerView);
const problemsHost = defineComponentAutomationViewHost<ComponentProps<typeof ProblemsView>>(() => ProblemsView);
const inspectorHost = defineComponentAutomationViewHost<ComponentProps<typeof InspectorView>>(() => InspectorView);
const routerHost = defineAutomationViewHost<RouterViewHostModel, RouterViewHostCommands>(({ model, commands }) => <RouterView {...model} {...commands} />);
const subflowsHost = defineAutomationViewHost<SubflowsViewHostModel, SubflowsViewHostCommands>(({ model, commands }) => <SubflowsView {...model} {...commands} />);
const instructionsHost = defineAutomationViewHost<InstructionsViewHostModel, InstructionsViewHostCommands>(({ model, commands }) => <InstructionsView {...model} {...commands} />);
const adaptationsHost = defineAutomationViewHost<AdaptationsViewHostModel, AdaptationsViewHostCommands>(({ model, commands }) => <AdaptationsView {...model} {...commands} />);
const settingsHost = defineAutomationViewHost<SettingsViewHostModel, SettingsViewHostCommands>(({ model, commands }) => <SettingsView {...model} {...commands} />);
const runtimeHost = defineAutomationViewHost<RuntimeViewHostModel, RuntimeViewHostCommands>(({ model, commands }) => (
  <RuntimeCanonicalHost model={model} commands={commands} />
));

function RuntimeCanonicalHost(props: { model: RuntimeViewHostModel; commands: RuntimeViewHostCommands }) {
  const { selectedTimeline, ...model } = props.model;
  const timelines = useMemo(() => selectedTimeline ? [selectedTimeline] : emptyTimelines, [selectedTimeline]);
  return <FlowRunView {...model} {...props.commands} timelines={timelines} />;
}

const standardStates = { loading: true, empty: true, error: true, stale: true, narrow: true } as const;
const available = (requirement: keyof AutomationStudioViewAvailability) =>
  (context: AutomationStudioViewAvailability) => context[requirement];
const lifecycle = (sleepUntilActivated = true) => ({ sleepUntilActivated, keepMounted: "warm" as const });
const cache = { schemaVersion: 1 } as const;
function functionality<Id extends string>(
  id: Id,
  purpose: string,
  scope: AutomationViewFunctionalityContract["scope"],
  summaryData: readonly string[],
  detailData: readonly string[],
  dataIntensity: AutomationViewFunctionalityContract["dataIntensity"]
): AutomationViewFunctionalityContract<Id> {
  return { id, purpose, scope, summaryData, detailData, dataIntensity, states: standardStates };
}

export const automationStudioViews = defineAutomationStudioViews({
  clients: {
    id: "client-gateway", aliases: [], kind: "clients", label: "Connected Clients", icon: Radio,
    group: "Workspace", region: "main", allowedRegions: ["main"], scope: "Current project", requires: "hasProject",
    isAvailable: available("hasProject"), addable: true, lifecycle: lifecycle(false), cache,
    functionality: functionality("client-gateway", "Connect and monitor project automation clients.", ["project"], ["client summaries"], ["client capabilities", "connection diagnostics"], "paged"),
    host: clientsHost
  },
  recordingTimeline: {
    id: "timeline-recording", aliases: [], kind: "recordings", label: "Timeline", icon: Radio,
    group: "Evidence", region: "main", allowedRegions: ["main"], scope: "Selected recording", requires: "hasRecording",
    isAvailable: available("hasRecording"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("timeline-recording", "Inspect recording evidence, notes, markers, and processing state.", ["recording"], ["recording summary", "timeline summary"], ["timeline entries", "notes", "markers", "state references"], "virtualized"),
    host: recordingTimelineHost
  },
  flowEditor: {
    id: "flow-nodes", aliases: ["policy-primary"], kind: "design", label: "Nodes", icon: GitBranch,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected Flow or subflow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("flow-nodes", "Build and edit the selected Flow or Subflow node graph.", ["flow", "subflow"], ["Flow identity", "graph revision"], ["nodes", "edges", "node definitions", "problems"], "graph"),
    host: flowEditorHost
  },
  router: {
    id: "flow-router", aliases: [], kind: "router", label: "Router", icon: GitBranch,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected top-level Flow", requires: "hasTopLevelFlow",
    isAvailable: available("hasTopLevelFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("flow-router", "Route a top-level Flow into scalable Subflow paths.", ["flow"], ["Flow identity", "Subflow summaries"], ["routes", "conditions", "route diagnostics"], "graph"),
    host: routerHost
  },
  subflows: {
    id: "flow-subflows", aliases: [], kind: "subflows", label: "Subflows", icon: GitBranch,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected Flow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("flow-subflows", "Browse and manage reusable Subflows and nested categories.", ["flow"], ["Subflow page", "category tree"], ["Subflow readiness", "router references"], "paged"),
    host: subflowsHost
  },
  instructions: {
    id: "flow-instructions", aliases: [], kind: "instructions", label: "Instructions", icon: ListChecks,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected Flow or subflow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("flow-instructions", "Author scoped deterministic and LLM guidance.", ["flow", "subflow"], ["instruction page", "effective order"], ["instruction body", "targets", "diagnostics"], "paged"),
    host: instructionsHost
  },
  adaptations: {
    id: "adaptations", aliases: [], kind: "adaptations", label: "Adaptations", icon: FileSearch,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected Flow or subflow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("adaptations", "Review, approve, inspect, and revert runtime adaptations.", ["flow", "subflow"], ["adaptation page"], ["changed fields", "evidence", "review history", "raw JSON"], "paged"),
    host: adaptationsHost
  },
  settings: {
    id: "flow-settings", aliases: [], kind: "settings", label: "Settings", icon: SlidersHorizontal,
    group: "Flow", region: "main", allowedRegions: ["main"], scope: "Selected Flow or subflow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("flow-settings", "Configure Flow or Subflow runtime, LLM, adaptation, limits, safety, and interfaces.", ["flow", "subflow"], ["effective settings"], ["editable settings", "inheritance", "dependencies"], "light"),
    host: settingsHost
  },
  state: {
    id: "state-explorer", aliases: ["signals-web"], kind: "state", label: "State View", icon: ListChecks,
    group: "Evidence", region: "main", allowedRegions: ["main"], scope: "Current selection", requires: "hasSelection",
    isAvailable: available("hasSelection"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("state-explorer", "Inspect observed and runtime State evidence across visual, structured, diff, compare, and raw modes.", ["selection", "recording", "flow"], ["state source index"], ["facts", "evidence", "visual surfaces", "comparisons"], "virtualized"),
    host: stateHost
  },
  runtime: {
    id: "runtime-debug", aliases: ["runs-history"], kind: "runtime", label: "Runtime Debug", icon: Bug,
    group: "Evidence", region: "main", allowedRegions: ["main"], scope: "Selected Flow", requires: "hasFlow",
    isAvailable: available("hasFlow"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("runtime-debug", "Launch Flows and inspect paginated Run and action history.", ["flow"], ["Run page"], ["Run detail", "actions", "events", "state and effect evidence"], "paged"),
    host: runtimeHost
  },
  problems: {
    id: "problems-view", aliases: [], kind: "problems", label: "Problems", icon: AlertTriangle,
    group: "Evidence", region: "right", allowedRegions: ["right"], scope: "Current project", requires: "hasProject",
    isAvailable: available("hasProject"), addable: true, lifecycle: lifecycle(false), cache,
    functionality: functionality("problems-view", "Find and navigate validation and runtime Problems.", ["project", "flow", "selection"], ["normalized problem list"], ["problem target and diagnostics"], "paged"),
    host: problemsHost
  },
  inspector: {
    id: "global-inspector", aliases: ["workspace-dock", "ai-assistant", "node-detail"], kind: "inspector", label: "Inspector", icon: SlidersHorizontal,
    group: "Workspace", region: "right", allowedRegions: ["right"], scope: "Current selection", requires: "hasProject",
    isAvailable: available("hasProject"), addable: true, lifecycle: lifecycle(), cache,
    functionality: functionality("global-inspector", "Inspect the currently selected Studio object without changing workspace ownership.", ["selection"], ["selected entity identity"], ["typed object panel", "references", "provenance"], "light"),
    host: inspectorHost
  }
});

export type AutomationStudioViewDefinitions = typeof automationStudioViews;
export type AutomationStudioViewKey = keyof AutomationStudioViewDefinitions;
export type AutomationStudioViewDefinition = AutomationStudioViewDefinitions[AutomationStudioViewKey];
export type AutomationStudioViewId = AutomationStudioViewDefinition["id"];
export type AutomationCanonicalViewHostKind = AutomationStudioViewDefinition["kind"];
export type AutomationViewDefinitionById<Id extends AutomationStudioViewId> = Extract<AutomationStudioViewDefinition, { id: Id }>;
export type AutomationViewDefinitionByKind<Kind extends AutomationCanonicalViewHostKind> = Extract<AutomationStudioViewDefinition, { kind: Kind }>;
export type AutomationViewHostBindingMap = {
  [Kind in AutomationCanonicalViewHostKind]: HostBindingOf<AutomationViewDefinitionByKind<Kind>>;
};
export type AutomationCanonicalPublisherInputs = {
  [Key in AutomationStudioViewKey]: {
    model: HostBindingOf<AutomationStudioViewDefinitions[Key]>["model"];
    commands: HostBindingOf<AutomationStudioViewDefinitions[Key]>["commands"];
    activity: "active" | "warm" | "inactive" | "unavailable";
    label?: string;
    state?: "dirty" | "live" | "warning";
    bodyClassName?: string;
  };
};

export const automationStudioViewIds = Object.freeze(
  Object.values(automationStudioViews).map((definition) => definition.id)
) as readonly AutomationStudioViewId[];
export const automationStudioViewId = Object.freeze(
  Object.fromEntries(Object.entries(automationStudioViews).map(([key, definition]) => [key, definition.id]))
) as { readonly [Key in AutomationStudioViewKey]: AutomationStudioViewDefinitions[Key]["id"] };
export const automationStudioViewDefinitionsList = Object.freeze(Object.values(automationStudioViews));
