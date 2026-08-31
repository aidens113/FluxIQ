import { useMemo } from "react";
import type { AutomationStudioStores } from "../../stores";
import { createAutomationConnectedViewHostRequest } from "../../views/view-host-types";
import type { AutomationWorkspaceViewEntry } from "../../workspace/shell/contracts";
import { createAutomationStudioViewInstances } from "../../views/view-instances";
import { automationStudioViewId } from "../../views/view-registry";
import {
  AutomationAdaptationsConnectedView,
  AutomationClientsConnectedView,
  AutomationFlowEditorConnectedView,
  AutomationInspectorConnectedView,
  AutomationInstructionsConnectedView,
  AutomationProblemsConnectedView,
  AutomationRecordingConnectedView,
  AutomationRouterConnectedView,
  AutomationRuntimeConnectedView,
  AutomationSettingsConnectedView,
  AutomationStateConnectedView,
  AutomationSubflowsConnectedView,
  type AutomationCanonicalConnectorScope
} from "./canonical-connected-views";
import { createAutomationDirectViewConnection } from "./direct-view-connector";

type AutomationConnectedViewEntryOptions = {
  commands: Record<string, Record<string, unknown>>;
  generation: number;
  scope: AutomationCanonicalConnectorScope;
  stores: AutomationStudioStores;
  views: ReturnType<typeof createAutomationStudioViewInstances>;
};

export function useAutomationConnectedViewEntries(options: AutomationConnectedViewEntryOptions) {
  const commandDependencies = Object.values(options.commands).flatMap((commands) => Object.values(commands));
  return useMemo(() => createAutomationConnectedViewEntries({
    commands: options.commands,
    generation: options.generation,
    scope: options.scope,
    stores: options.stores,
    views: options.views
  }), [
    options.generation, options.scope, options.stores, options.views, ...commandDependencies
  ]);
}

export function createAutomationConnectedViewEntries(args: {
  commands: Record<string, Record<string, unknown>>;
  generation: number;
  scope: AutomationCanonicalConnectorScope;
  stores: AutomationStudioStores;
  views: ReturnType<typeof createAutomationStudioViewInstances>;
}): AutomationWorkspaceViewEntry[] {
  const byId = new Map(args.views.map((view) => [view.id, view]));
  const entry = (viewId: string, Connector: any) => {
    const view = byId.get(viewId);
    if (!view) throw new Error(`Missing Automation Studio view instance: ${viewId}`);
    const connect = createAutomationDirectViewConnection(Connector, {
      commands: args.commands[viewId] ?? {},
      projectGeneration: args.generation,
      scope: args.scope,
      stores: args.stores,
      view: view as never
    } as never);
    return {
      view,
      request: createAutomationConnectedViewHostRequest(view as never, connect)
    } as AutomationWorkspaceViewEntry;
  };
  return [
    entry(automationStudioViewId.clients, AutomationClientsConnectedView),
    entry(automationStudioViewId.flowEditor, AutomationFlowEditorConnectedView),
    entry(automationStudioViewId.recordingTimeline, AutomationRecordingConnectedView),
    entry(automationStudioViewId.state, AutomationStateConnectedView),
    entry(automationStudioViewId.runtime, AutomationRuntimeConnectedView),
    entry(automationStudioViewId.problems, AutomationProblemsConnectedView),
    entry(automationStudioViewId.inspector, AutomationInspectorConnectedView),
    entry(automationStudioViewId.router, AutomationRouterConnectedView),
    entry(automationStudioViewId.subflows, AutomationSubflowsConnectedView),
    entry(automationStudioViewId.instructions, AutomationInstructionsConnectedView),
    entry(automationStudioViewId.adaptations, AutomationAdaptationsConnectedView),
    entry(automationStudioViewId.settings, AutomationSettingsConnectedView)
  ];
}
