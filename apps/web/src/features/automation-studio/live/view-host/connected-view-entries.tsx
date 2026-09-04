import { useLayoutEffect, useRef } from "react";
import type { AutomationStudioStores } from "../../stores";
import { createAutomationConnectedViewHostRequest } from "../../views/view-host-types";
import type { AutomationWorkspaceViewEntry } from "../../workspace/shell/contracts";
import { createAutomationWorkspaceViewSource } from "../../workspace/shell/view-source";
import { createAutomationStudioViewInstances } from "../../views/view-instances";
import { automationStudioViewBaseId, automationStudioViewId } from "../../views/view-registry";
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
  const cacheRef = useRef<AutomationConnectedViewEntryCache | null>(null);
  if (!cacheRef.current) cacheRef.current = createAutomationConnectedViewEntryCache();
  return cacheRef.current.update(options);
}

type CachedEntry = {
  commands: Record<string, unknown>;
  generation: number;
  scope: AutomationCanonicalConnectorScope;
  sourceScope: AutomationCanonicalConnectorScope;
  stores: AutomationStudioStores;
  view: ReturnType<typeof createAutomationStudioViewInstances>[number];
  entry: AutomationWorkspaceViewEntry;
};

export type AutomationConnectedViewEntryCache = {
  update(options: AutomationConnectedViewEntryOptions): readonly AutomationWorkspaceViewEntry[];
};

export function createAutomationConnectedViewEntryCache(): AutomationConnectedViewEntryCache {
  const cached = new Map<string, CachedEntry>();
  let previous: readonly AutomationWorkspaceViewEntry[] = [];
  return {
    update(options) {
      const byId = new Map(options.views.map((view) => [view.id, view]));
      const entry = (viewId: string, Connector: any) => {
        const view = byId.get(viewId);
        if (!view) throw new Error(`Missing Automation Studio view instance: ${viewId}`);
        const baseViewId = automationStudioViewBaseId(viewId);
        const commands = options.commands[baseViewId] ?? emptyCommands;
        const current = cached.get(viewId);
        const connectorScope = current?.sourceScope === options.scope
          ? current.scope
          : { ...options.scope, viewInstanceId: viewId };
        if (current
          && current.commands === commands
          && current.generation === options.generation
          && current.sourceScope === options.scope
          && current.stores === options.stores
          && current.view === view) return current.entry;
        const connect = createAutomationDirectViewConnection(Connector as never, {
          commands,
          projectGeneration: options.generation,
          scope: connectorScope,
          stores: options.stores,
          view: view as never
        } as never);
        const entry = {
          view,
          request: createAutomationConnectedViewHostRequest(view as never, connect)
        } as AutomationWorkspaceViewEntry;
        cached.set(viewId, { commands, generation: options.generation, scope: connectorScope, sourceScope: options.scope, stores: options.stores, view, entry });
        return entry;
      };
      const next = options.views.flatMap((view) => {
        const Connector = connectorByViewId.get(automationStudioViewBaseId(view.id));
        return Connector ? [entry(view.id, Connector)] : [];
      });
      for (const viewId of cached.keys()) {
        if (!byId.has(viewId)) cached.delete(viewId);
      }
      if (next.length === previous.length && next.every((entry, index) => entry === previous[index])) return previous;
      previous = next;
      return previous;
    }
  };
}

export function useAutomationConnectedViewSource(
  projectKey: string,
  entries: readonly AutomationWorkspaceViewEntry[]
) {
  const entryKey = automationConnectedViewEntryKey(entries);
  const ownerRef = useRef<{ entryKey: string; owner: AutomationConnectedViewSourceOwner } | null>(null);
  if (!ownerRef.current
    || ownerRef.current.owner.projectKey !== projectKey
    || ownerRef.current.entryKey !== entryKey) {
    ownerRef.current = {
      entryKey,
      owner: createAutomationConnectedViewSourceOwner(projectKey, entries)
    };
  }
  const owner = ownerRef.current.owner;
  useLayoutEffect(() => owner.update(entries), [entries, owner]);
  return owner.source;
}

export function automationConnectedViewEntryKey(entries: readonly AutomationWorkspaceViewEntry[]): string {
  return entries.map((entry) => entry.view.id).join("\u001f");
}

export type AutomationConnectedViewSourceOwner = {
  readonly projectKey: string;
  readonly source: ReturnType<typeof createAutomationWorkspaceViewSource>;
  update(entries: readonly AutomationWorkspaceViewEntry[]): void;
};

export function createAutomationConnectedViewSourceOwner(
  projectKey: string,
  initialEntries: readonly AutomationWorkspaceViewEntry[]
): AutomationConnectedViewSourceOwner {
  const source = createAutomationWorkspaceViewSource(initialEntries.map((entry) => [entry.view.id, entry] as const));
  let viewIds = new Set(initialEntries.map((entry) => entry.view.id));
  return {
    projectKey,
    source,
    update(entries) {
      const nextIds = new Set(entries.map((entry) => entry.view.id));
      for (const viewId of viewIds) {
        if (!nextIds.has(viewId)) source.replace(viewId, null);
      }
      for (const entry of entries) source.replace(entry.view.id, entry);
      viewIds = nextIds;
    }
  };
}

export function createAutomationConnectedViewEntries(args: {
  commands: Record<string, Record<string, unknown>>;
  generation: number;
  scope: AutomationCanonicalConnectorScope;
  stores: AutomationStudioStores;
  views: ReturnType<typeof createAutomationStudioViewInstances>;
}): AutomationWorkspaceViewEntry[] {
  return [...createAutomationConnectedViewEntryCache().update(args)];
}

const emptyCommands = Object.freeze({}) as Record<string, unknown>;

const connectorByViewId = new Map<string, any>([
  [automationStudioViewId.clients, AutomationClientsConnectedView],
  [automationStudioViewId.flowEditor, AutomationFlowEditorConnectedView],
  [automationStudioViewId.recordingTimeline, AutomationRecordingConnectedView],
  [automationStudioViewId.state, AutomationStateConnectedView],
  [automationStudioViewId.runtime, AutomationRuntimeConnectedView],
  [automationStudioViewId.problems, AutomationProblemsConnectedView],
  [automationStudioViewId.inspector, AutomationInspectorConnectedView],
  [automationStudioViewId.router, AutomationRouterConnectedView],
  [automationStudioViewId.subflows, AutomationSubflowsConnectedView],
  [automationStudioViewId.instructions, AutomationInstructionsConnectedView],
  [automationStudioViewId.adaptations, AutomationAdaptationsConnectedView],
  [automationStudioViewId.settings, AutomationSettingsConnectedView]
]);
