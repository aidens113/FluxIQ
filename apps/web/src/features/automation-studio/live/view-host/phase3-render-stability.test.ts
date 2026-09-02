import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioViewInstances } from "../../views/view-instances";
import { automationStudioViewId } from "../../views/view-registry";
import { createAutomationStudioStores } from "../../stores";
import { createAutomationHierarchyStore } from "../../hierarchy/store";
import { defaultAutomationWorkspacePrefs } from "../../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../../workspace/render-store";
import { createAutomationWorkspaceCommandPort } from "../../workspace/commands/port";
import { createAutomationWorkspaceCommands } from "../../workspace/commands/workspace-commands";
import { createAutomationProjectViewModelCache } from "../../model/project-view-model-cache";
import {
  createAutomationConnectedViewEntryCache,
  createAutomationConnectedViewSourceOwner
} from "./connected-view-entries";

describe("Phase 3 connected-view render stability", () => {
  it("preserves entry and source identities across selection, disclosure, menu, and pane actions", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const projectView = createAutomationProjectViewModelCache({ activeProjectId: "project-a", stores, workspace });
    const scope = connectorScope(projectView);
    const views = createAutomationStudioViewInstances();
    const commands = stableCommands();
    const cache = createAutomationConnectedViewEntryCache();
    const first = cache.update({ commands, generation: 1, scope, stores, views });
    const owner = createAutomationConnectedViewSourceOwner("project-a", first);
    const source = owner.source;
    const sourceNotification = vi.fn();
    const unsubscribe = source.subscribe(automationStudioViewId.router, sourceNotification);
    const hierarchy = createAutomationHierarchyStore();
    const workspaceCommands = createAutomationWorkspaceCommands({ port: createAutomationWorkspaceCommandPort(workspace) });

    stores.selection.select({ kind: "flow", id: "flow-a" });
    hierarchy.toggleFolder("folder-a");
    let menuOpen = false;
    menuOpen = !menuOpen;
    workspaceCommands.openView(automationStudioViewId.router);

    const second = cache.update({ commands, generation: 1, scope, stores, views });
    owner.update(second);
    expect(menuOpen).toBe(true);
    expect(second).toBe(first);
    expect(owner.source).toBe(source);
    expect(sourceNotification).not.toHaveBeenCalled();
    expect(source.getRevision(automationStudioViewId.router)).toBe(0);
    unsubscribe();
  });

  it("replaces only the entry whose command contract changes", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const projectView = createAutomationProjectViewModelCache({ activeProjectId: "project-a", stores, workspace });
    const scope = connectorScope(projectView);
    const views = createAutomationStudioViewInstances();
    const commands = stableCommands();
    const cache = createAutomationConnectedViewEntryCache();
    const first = cache.update({ commands, generation: 2, scope, stores, views });
    const changedCommands = {
      ...commands,
      [automationStudioViewId.runtime]: { onOpenAdaptation: vi.fn() }
    };
    const second = cache.update({ commands: changedCommands, generation: 2, scope, stores, views });
    const byId = (entries: readonly typeof first[number][]) => new Map(entries.map((entry) => [entry.view.id, entry]));
    const before = byId(first);
    const after = byId(second);

    expect(after.get(automationStudioViewId.runtime)).not.toBe(before.get(automationStudioViewId.runtime));
    expect(after.get(automationStudioViewId.router)).toBe(before.get(automationStudioViewId.router));
    expect(after.get(automationStudioViewId.flowEditor)).toBe(before.get(automationStudioViewId.flowEditor));
  });

  it("creates a new source only when the project session changes", () => {
    const entries = [fakeEntry(automationStudioViewId.router), fakeEntry(automationStudioViewId.settings)];
    const firstSession = createAutomationConnectedViewSourceOwner("project-a", entries);
    const source = firstSession.source;
    firstSession.update(entries);
    expect(firstSession.source).toBe(source);

    const secondSession = createAutomationConnectedViewSourceOwner("project-b", entries);
    expect(secondSession.source).not.toBe(source);
  });
});

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

function stableCommands(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(createAutomationStudioViewInstances().map((view) => [view.id, Object.freeze({})]));
}

function fakeEntry(viewId: string) {
  return {
    view: { id: viewId, label: viewId, type: "router", icon: (() => null) as never },
    request: { kind: "router", view: { id: viewId } }
  } as never;
}
