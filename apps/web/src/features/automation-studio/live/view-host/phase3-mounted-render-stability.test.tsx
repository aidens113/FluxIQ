import { Profiler, useSyncExternalStore, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { createAutomationHierarchyStore } from "../../hierarchy/store";
import { createAutomationProjectViewModelCache } from "../../model/project-view-model-cache";
import { createAutomationStudioStores } from "../../stores";
import { useAutomationStoreSelector } from "../../stores/use-store-selector";
import { createAutomationStudioViewInstances } from "../../views/view-instances";
import { automationStudioViewId } from "../../views/view-registry";
import { createAutomationWorkspaceCommandPort } from "../../workspace/commands/port";
import { createAutomationWorkspaceCommands } from "../../workspace/commands/workspace-commands";
import { defaultAutomationWorkspacePrefs } from "../../workspace/layout";
import { createAutomationStudioOverlayStore, useAutomationOverlaySelection } from "../../workspace/overlays/overlay-state-store";
import { createAutomationWorkspaceRenderStore } from "../../workspace/render-store";
import type { AutomationWorkspaceViewSource } from "../../workspace/shell/contracts";
import { useAutomationWorkspaceSelector } from "../../workspace/shell/selectors";
import { useAutomationWorkspaceView } from "../../workspace/shell/view-source";
import {
  createAutomationConnectedViewEntryCache,
  createAutomationConnectedViewSourceOwner
} from "./connected-view-entries";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Phase 3 mounted React render stability", () => {
  it("isolates hierarchy selection, disclosure, menu, and pane commits from unrelated connected views", async () => {
    const stores = createAutomationStudioStores();
    const workspacePrefs = defaultAutomationWorkspacePrefs();
    workspacePrefs.panes[0] = {
      ...workspacePrefs.panes[0]!,
      tabs: [
        automationStudioViewId.flowEditor,
        automationStudioViewId.runtime,
        automationStudioViewId.settings
      ]
    };
    const workspace = createAutomationWorkspaceRenderStore(workspacePrefs);
    const hierarchy = createAutomationHierarchyStore();
    const overlays = createAutomationStudioOverlayStore();
    const projectView = createAutomationProjectViewModelCache({
      activeProjectId: "project-a",
      stores,
      workspace
    });
    const scope = connectorScope(projectView);
    const views = createAutomationStudioViewInstances();
    const connectorCommands = stableConnectorCommands();
    const entryCache = createAutomationConnectedViewEntryCache();
    const entries = entryCache.update({
      commands: connectorCommands,
      generation: 1,
      scope,
      stores,
      views
    });
    const owner = createAutomationConnectedViewSourceOwner("project-a", entries);
    const trackedSource = trackViewSourceSubscriptions(owner.source);
    const workspaceCommands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(workspace)
    });
    const commits = createCommitCounter();
    const entryIdentity = new Map(entries.map((entry) => [entry.view.id, entry]));
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <>
          <Profiled id="selection" onRender={commits.onRender}>
            <SelectionProbe store={stores.selection} />
          </Profiled>
          <Profiled id="hierarchy" onRender={commits.onRender}>
            <HierarchyProbe store={hierarchy} />
          </Profiled>
          <Profiled id="hierarchy-menu" onRender={commits.onRender}>
            <HierarchyMenuProbe store={overlays} />
          </Profiled>
          <Profiled id="workspace-pane" onRender={commits.onRender}>
            <WorkspacePaneProbe store={workspace} />
          </Profiled>
          <Profiled id="connected-router" onRender={commits.onRender}>
            <ConnectedEntryProbe source={trackedSource.source} viewId={automationStudioViewId.router} />
          </Profiled>
          <Profiled id="connected-settings" onRender={commits.onRender}>
            <ConnectedEntryProbe source={trackedSource.source} viewId={automationStudioViewId.settings} />
          </Profiled>
        </>
      );
    });

    expect(trackedSource.subscriptionCount(automationStudioViewId.router)).toBe(1);
    expect(trackedSource.subscriptionCount(automationStudioViewId.settings)).toBe(1);
    commits.reset();

    await act(async () => {
      stores.selection.select({ kind: "flow", id: "flow-a" });
    });
    expect(commits.snapshot()).toEqual({ selection: 1 });
    assertConnectedViewsStable();

    commits.reset();
    await act(async () => {
      hierarchy.toggleFolder("flow-a");
    });
    expect(commits.snapshot()).toEqual({ hierarchy: 1 });
    assertConnectedViewsStable();

    commits.reset();
    await act(async () => {
      overlays.open("hierarchy", {
        id: "hierarchy-menu:create",
        kind: "create",
        category: "flow",
        categoryLabel: "Flows",
        parentId: "flow-a",
        allowedKinds: ["folder", "subflow"],
        folderSource: {
          resolve: () => null,
          search: () => []
        },
        subflowContainer: true
      });
    });
    expect(commits.snapshot()).toEqual({ "hierarchy-menu": 1 });
    assertConnectedViewsStable();

    commits.reset();
    await act(async () => {
      workspaceCommands.selectPaneTab(workspacePrefs.panes[0]!.id, automationStudioViewId.runtime);
    });
    expect(commits.snapshot()).toEqual({ "workspace-pane": 1 });
    assertConnectedViewsStable();

    await act(async () => {
      renderer!.unmount();
    });
    expect(trackedSource.unsubscribeCount(automationStudioViewId.router)).toBe(1);
    expect(trackedSource.unsubscribeCount(automationStudioViewId.settings)).toBe(1);

    function assertConnectedViewsStable() {
      const next = entryCache.update({
        commands: connectorCommands,
        generation: 1,
        scope,
        stores,
        views
      });
      owner.update(next);
      expect(next).toBe(entries);
      expect(owner.source).toBe(trackedSource.backing);
      expect(owner.source.get(automationStudioViewId.router)).toBe(entryIdentity.get(automationStudioViewId.router));
      expect(owner.source.get(automationStudioViewId.settings)).toBe(entryIdentity.get(automationStudioViewId.settings));
      expect(commits.count("connected-router")).toBe(0);
      expect(commits.count("connected-settings")).toBe(0);
      expect(trackedSource.subscriptionCount(automationStudioViewId.router)).toBe(1);
      expect(trackedSource.subscriptionCount(automationStudioViewId.settings)).toBe(1);
      expect(trackedSource.unsubscribeCount(automationStudioViewId.router)).toBe(0);
      expect(trackedSource.unsubscribeCount(automationStudioViewId.settings)).toBe(0);
    }
  });
});

function Profiled(props: {
  children: ReactNode;
  id: string;
  onRender: ProfilerOnRenderCallback;
}) {
  return <Profiler id={props.id} onRender={props.onRender}>{props.children}</Profiler>;
}

function SelectionProbe(props: { store: ReturnType<typeof createAutomationStudioStores>["selection"] }) {
  const selection = useAutomationStoreSelector(props.store, (state) => state.selection, "selection");
  return <span>{selection?.id ?? "none"}</span>;
}

function HierarchyProbe(props: { store: ReturnType<typeof createAutomationHierarchyStore> }) {
  const state = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot);
  return <span>{state.collapsedFolderIds.join(",")}</span>;
}

function HierarchyMenuProbe(props: { store: ReturnType<typeof createAutomationStudioOverlayStore> }) {
  const request = useAutomationOverlaySelection(props.store, "hierarchy");
  return <span>{request?.id ?? "closed"}</span>;
}

function WorkspacePaneProbe(props: { store: ReturnType<typeof createAutomationWorkspaceRenderStore> }) {
  const activeViewId = useAutomationWorkspaceSelector(props.store, (prefs) => prefs.panes[0]?.activeViewId ?? "");
  return <span>{activeViewId}</span>;
}

function ConnectedEntryProbe(props: { source: AutomationWorkspaceViewSource; viewId: string }) {
  const entry = useAutomationWorkspaceView(props.source, props.viewId);
  return <span>{entry?.view.id ?? "missing"}</span>;
}

function createCommitCounter() {
  const counts = new Map<string, number>();
  const onRender: ProfilerOnRenderCallback = (id) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  return {
    onRender,
    count: (id: string) => counts.get(id) ?? 0,
    reset: () => counts.clear(),
    snapshot: () => Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
}

function trackViewSourceSubscriptions(backing: AutomationWorkspaceViewSource) {
  const subscriptions = new Map<string, number>();
  const unsubscriptions = new Map<string, number>();
  const source: AutomationWorkspaceViewSource = {
    get: backing.get,
    getRevision: backing.getRevision,
    replace: backing.replace,
    subscribe(viewId, listener) {
      subscriptions.set(viewId, (subscriptions.get(viewId) ?? 0) + 1);
      const unsubscribe = backing.subscribe(viewId, listener);
      return () => {
        unsubscriptions.set(viewId, (unsubscriptions.get(viewId) ?? 0) + 1);
        unsubscribe();
      };
    }
  };
  return {
    backing,
    source,
    subscriptionCount: (viewId: string) => subscriptions.get(viewId) ?? 0,
    unsubscribeCount: (viewId: string) => unsubscriptions.get(viewId) ?? 0
  };
}

function connectorScope(projectView: ReturnType<typeof createAutomationProjectViewModelCache>) {
  return {
    projectId: "project-a",
    projectView,
    getWorkspacePrefs: () => defaultAutomationWorkspacePrefs(),
    loadFlowDetail: vi.fn(),
    loadFlowMetadata: vi.fn(),
    loadNodeDefinitions: vi.fn(),
    loadRecording: vi.fn(),
    loadTimeline: vi.fn()
  };
}

function stableConnectorCommands(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    createAutomationStudioViewInstances().map((view) => [view.id, Object.freeze({})])
  );
}
