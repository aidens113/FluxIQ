import { describe, expect, it, vi } from "vitest";
import { automationEntityScope, createAutomationProjectDataStore } from "../stores/project-data-store";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import {
  observeAutomationWorkspaceSelector,
  shallowAutomationWorkspaceSliceEqual,
} from "../workspace/shell/selectors";
import { createPhase11DeterministicScaleFixture } from "./phase11-deterministic-fixture";

const EVIDENCE_KIND = "scoped-store-notification" as const;

describe("Phase 11 deterministic subscription isolation", () => {
  it("counts shell selector invalidations without treating them as browser render commits", () => {
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const counts = createShellInvalidationCounters(store);

    store.replace({ ...store.getPrefs(), sidebarWidth: store.getPrefs().sidebarWidth + 20 });
    expect(EVIDENCE_KIND).toBe("scoped-store-notification");
    expect(counts.values()).toEqual({ shell: 1, hierarchy: 1, editor: 0, inspector: 0, timeline: 0 });

    counts.reset();
    store.replace({ ...store.getPrefs(), inspectorWidth: store.getPrefs().inspectorWidth + 20 });
    expect(counts.values()).toEqual({ shell: 0, hierarchy: 0, editor: 0, inspector: 1, timeline: 0 });

    counts.reset();
    store.replace({ ...store.getPrefs(), bottomTimelineHeight: store.getPrefs().bottomTimelineHeight + 20 });
    expect(counts.values()).toEqual({ shell: 0, hierarchy: 0, editor: 0, inspector: 0, timeline: 1 });

    counts.reset();
    const prefs = store.getPrefs();
    const nextPane = { ...prefs.panes[0]!, activeViewId: "flow-settings" };
    store.replace({
      ...prefs,
      activeViewId: "flow-settings",
      panes: [nextPane, ...prefs.panes.slice(1)],
    });
    expect(counts.values()).toEqual({ shell: 0, hierarchy: 0, editor: 1, inspector: 0, timeline: 0 });

    counts.dispose();
  });

  it("notifies only the active connector domain scope for a scale-fixture run update", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const store = createAutomationProjectDataStore();
    store.replaceAll("flows", fixture.flowEntries);
    store.replaceAll("runs", fixture.project.runs.map((run) => [run.runId, run] as const));

    const activeRuntimeConnector = vi.fn();
    const unrelatedSettingsConnector = vi.fn();
    const unrelatedRecordingConnector = vi.fn();
    const unsubscribes = [
      store.subscribe(activeRuntimeConnector, automationEntityScope("runs")),
      store.subscribe(unrelatedSettingsConnector, automationEntityScope("flows")),
      store.subscribe(unrelatedRecordingConnector, automationEntityScope("recordings")),
    ];
    const run = fixture.project.runs[0]!;

    store.upsert("runs", run.runId, { ...run, status: "failed" });

    expect(EVIDENCE_KIND).toBe("scoped-store-notification");
    expect(activeRuntimeConnector).toHaveBeenCalledTimes(1);
    expect(unrelatedSettingsConnector).not.toHaveBeenCalled();
    expect(unrelatedRecordingConnector).not.toHaveBeenCalled();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  it("stops domain invalidations after an active connector subscription becomes dormant", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const store = createAutomationProjectDataStore();
    const runtimeConnector = vi.fn();
    const run = fixture.project.runs[0]!;
    const unsubscribe = store.subscribe(runtimeConnector, automationEntityScope("runs"));

    store.upsert("runs", run.runId, { ...run, status: "failed" });
    expect(runtimeConnector).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.upsert("runs", run.runId, { ...run, status: "succeeded" });

    expect(EVIDENCE_KIND).toBe("scoped-store-notification");
    expect(runtimeConnector).toHaveBeenCalledTimes(1);
  });
});

function createShellInvalidationCounters(store: ReturnType<typeof createAutomationWorkspaceRenderStore>) {
  const counters = {
    shell: vi.fn(),
    hierarchy: vi.fn(),
    editor: vi.fn(),
    inspector: vi.fn(),
    timeline: vi.fn(),
  };
  const shallow = shallowAutomationWorkspaceSliceEqual as (
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ) => boolean;
  const unsubscribes = [
    observeAutomationWorkspaceSelector(store, (prefs) => ({
      density: prefs.density,
      motion: prefs.motion,
      sidebarCollapsed: prefs.leftSidebarCollapsed,
      sidebarWidth: prefs.sidebarWidth,
    }), counters.shell, shallow),
    observeAutomationWorkspaceSelector(store, (prefs) => ({
      collapsed: prefs.leftSidebarCollapsed,
      width: prefs.sidebarWidth,
    }), counters.hierarchy, shallow),
    observeAutomationWorkspaceSelector(store, (prefs) => ({
      activePaneId: prefs.activePaneId,
      panes: prefs.panes,
      preset: prefs.mainLayoutPreset,
      ratios: prefs.mainSplitRatios,
    }), counters.editor, shallow),
    observeAutomationWorkspaceSelector(store, (prefs) => ({
      activeViewId: prefs.rightSidebar.activeViewId,
      collapsed: prefs.rightSidebarCollapsed,
      tabs: prefs.rightSidebar.tabs,
      width: prefs.inspectorWidth,
    }), counters.inspector, shallow),
    observeAutomationWorkspaceSelector(store, (prefs) => ({
      collapsed: prefs.bottomTimelineCollapsed,
      height: prefs.bottomTimelineHeight,
    }), counters.timeline, shallow),
  ];
  return {
    values: () => Object.fromEntries(Object.entries(counters).map(([key, counter]) => [key, counter.mock.calls.length])),
    reset: () => Object.values(counters).forEach((counter) => counter.mockClear()),
    dispose: () => unsubscribes.forEach((unsubscribe) => unsubscribe()),
  };
}
