import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioRuntime } from "../bootstrap/studio-runtime";
import { createAutomationHierarchyStore, normalizeAutomationHierarchyUiState } from "../hierarchy/store";
import {
  createAutomationHierarchyUiCoordinator,
  normalizeAutomationHierarchySidebarUiState,
  type AutomationHierarchySidebarUiState
} from "../hierarchy/ui-coordinator";
import type { AutomationProjectHydration } from "../project";
import { createAutomationWorkspaceCommandPort } from "../workspace/commands/port";
import { createAutomationWorkspaceCommands } from "../workspace/commands/workspace-commands";
import { defaultAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioViewId } from "../views/view-registry";
import { useAutomationProjectRuntime } from "./useAutomationProjectRuntime";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Automation Studio project-opening hydration revisions", () => {
  it("keeps local workspace and hierarchy changes when durable and cached hydration finish late", async () => {
    const runtime = createAutomationStudioRuntime();
    const workspace = runtime.owners.workspaceRenderStore;
    const workspaceCommands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(workspace)
    });
    const hierarchy = createAutomationHierarchyStore();
    const hierarchyUi = createAutomationHierarchyUiCoordinator();
    hierarchy.setChangeListener((tree) => hierarchyUi.setTree(tree));

    const durableHydrations = new Map<string, Deferred<AutomationProjectHydration>>();
    const cachedWorkspaceHydrations = new Map<string, (prefs: AutomationWorkspacePrefs) => void>();
    const cachedHierarchyHydrations = new Map<string, (sidebar: AutomationHierarchySidebarUiState) => void>();
    const projectDataPlatform = {
      closeProject: vi.fn(),
      openProject: vi.fn(),
      loadHydration: vi.fn((projectId: string) => {
        const pending = deferred<AutomationProjectHydration>();
        durableHydrations.set(projectId, pending);
        return pending.promise;
      }),
      notifyMutation: vi.fn()
    };
    const uiCache = {
      cancelProject: vi.fn(),
      hydrateWorkspacePrefs: vi.fn((input: {
        projectId: string;
        onHydrate: (prefs: AutomationWorkspacePrefs) => void;
      }) => cachedWorkspaceHydrations.set(input.projectId, input.onHydrate)),
      hydrateSidebar: vi.fn((input: {
        projectId: string;
        onHydrate: (sidebar: AutomationHierarchySidebarUiState) => void;
      }) => cachedHierarchyHydrations.set(input.projectId, input.onHydrate))
    };
    let projectRuntime!: ReturnType<typeof useAutomationProjectRuntime>;

    function Harness() {
      projectRuntime = useAutomationProjectRuntime({
        currentUserId: "user-a",
        pathname: "/programs/automation-studio",
        activeProjectId: null,
        urlProjectId: null,
        foundation: {
          projectDataPlatform: projectDataPlatform as any,
          projectGeneration: runtime.projectGeneration,
          uiCache: uiCache as any,
          liveCommands: {} as any,
          requests: runtime.requests,
          stores: runtime.owners.studioStores
        },
        hierarchy: {
          getUiRevision: hierarchyUi.getRevision,
          setLoadedProjectId: vi.fn(),
          setCustomNodes: vi.fn(),
          setDeletedIds: vi.fn(),
          hydrateSidebar(sidebar) {
            const normalized = normalizeAutomationHierarchySidebarUiState(sidebar);
            hierarchy.hydrate(normalized);
            hierarchyUi.hydrate({
              filter: { search: normalized.search, typeFilter: normalized.typeFilter },
              tree: normalized
            });
          },
          markPersisted: vi.fn(),
          reset() {
            hierarchy.hydrate(normalizeAutomationHierarchyUiState(undefined));
            hierarchyUi.reset();
          }
        },
        workspace: {
          getPrefsRevision: () => workspace.getRevision("prefs"),
          replacePrefs: (next) => workspace.replace(typeof next === "function" ? next(workspace.getPrefs()) : next),
          resetCachedPrefs: vi.fn()
        },
        data: {
          setDirty: vi.fn(),
          setProjectRecordings: vi.fn(),
          setPipelineArtifacts: vi.fn(),
          setProjectFlows: vi.fn(),
          setRuntimeSessions: vi.fn(),
          setNativeNodeDefinitions: vi.fn(),
          setPublishedFlowDefinitions: vi.fn(),
          setProjectTimelines: vi.fn()
        },
        schedule: (commit) => commit()
      });
      return null;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Harness />);
    });

    // Interaction during project opening must win over the late durable document.
    let firstOpen!: Promise<boolean>;
    await act(async () => {
      firstOpen = projectRuntime.openProject("project-durable-late", { updateUrl: false });
      await Promise.resolve();
      workspaceCommands.openView(automationStudioViewId.runtime);
      workspaceCommands.applyLayoutPreset("two-even");
      hierarchy.setPrimary("flow-local-durable");
      hierarchy.toggleFolder("folder-local-durable");
    });
    const firstWorkspace = workspace.getPrefs();
    const firstHierarchy = hierarchyUi.getSnapshot();

    await act(async () => {
      durableHydrations.get("project-durable-late")!.resolve(projectHydration({
        ...defaultAutomationWorkspacePrefs(),
        activeViewId: automationStudioViewId.settings
      }));
      await firstOpen;
    });

    expect(workspace.getPrefs()).toEqual(firstWorkspace);
    expect(hierarchyUi.getSnapshot()).toEqual(firstHierarchy);
    expect(workspace.getPrefs()).toMatchObject({
      activeViewId: automationStudioViewId.runtime,
      mainLayoutPreset: "two-even"
    });
    expect(hierarchyUi.getSnapshot().tree).toMatchObject({
      primaryTreeNodeId: "flow-local-durable",
      collapsedFolderIds: ["folder-local-durable"]
    });
    expect(cachedWorkspaceHydrations.has("project-durable-late")).toBe(false);
    expect(cachedHierarchyHydrations.has("project-durable-late")).toBe(false);

    // Once durable state has committed, interaction must also win over both queued cache lanes.
    let secondOpen!: Promise<boolean>;
    await act(async () => {
      secondOpen = projectRuntime.openProject("project-cache-late", { updateUrl: false });
      await Promise.resolve();
      durableHydrations.get("project-cache-late")!.resolve(projectHydration(defaultAutomationWorkspacePrefs()));
      await secondOpen;
    });
    expect(cachedWorkspaceHydrations.has("project-cache-late")).toBe(true);
    expect(cachedHierarchyHydrations.has("project-cache-late")).toBe(true);

    await act(async () => {
      workspaceCommands.openView(automationStudioViewId.instructions);
      workspaceCommands.applyLayoutPreset("two-rows");
      hierarchy.setPrimary("flow-local-cache");
      hierarchy.toggleFolder("folder-local-cache");
    });
    const secondWorkspace = workspace.getPrefs();
    const secondHierarchy = hierarchyUi.getSnapshot();

    await act(async () => {
      cachedWorkspaceHydrations.get("project-cache-late")!({
        ...defaultAutomationWorkspacePrefs(),
        activeViewId: automationStudioViewId.settings,
        sidebarWidth: 444
      });
      cachedHierarchyHydrations.get("project-cache-late")!({
        collapsedFolderIds: ["folder-stale-cache"],
        expandedDefaultCollapsedIds: [],
        focusedTreeNodeId: "flow-stale-cache",
        primaryTreeNodeId: "flow-stale-cache",
        search: "stale",
        typeFilter: "flow"
      });
    });

    expect(workspace.getPrefs()).toEqual(secondWorkspace);
    expect(hierarchyUi.getSnapshot()).toEqual(secondHierarchy);
    expect(workspace.getPrefs()).toMatchObject({
      activeViewId: automationStudioViewId.instructions,
      mainLayoutPreset: "two-rows"
    });
    expect(hierarchyUi.getSnapshot().tree).toMatchObject({
      primaryTreeNodeId: "flow-local-cache",
      collapsedFolderIds: ["folder-local-cache"]
    });

    await act(async () => {
      renderer.unmount();
    });
    runtime.dispose();
  });
});

function projectHydration(workspacePrefs: AutomationWorkspacePrefs): AutomationProjectHydration {
  return {
    hierarchy: {
      customHierarchyNodes: [],
      deletedHierarchyIds: [],
      workspacePrefs
    },
    summary: null
  };
}

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  return {
    promise: new Promise<Value>((done) => { resolve = done; }),
    resolve
  };
}
