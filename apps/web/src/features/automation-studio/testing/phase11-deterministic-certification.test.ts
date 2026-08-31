import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioRuntime } from "../bootstrap/studio-runtime";
import {
  AUTOMATION_HIERARCHY_ROW_PAGE_SIZE,
  selectAutomationHierarchyRowWindow,
} from "../hierarchy/bounded-rows";
import { createAutomationProjectLifecycle } from "../project/project-lifecycle";
import {
  automationEntityCollectionSelector,
  automationEntityMapSelector,
  createAutomationProjectDataStore,
} from "../stores/project-data-store";
import {
  automationQueryIdsSelector,
  automationQueryKey,
  automationQuerySelector,
  createAutomationProjectQueryStore,
  type AutomationProjectQuery,
} from "../stores/project-query-store";
import { createAutomationStudioStores } from "../stores/studio-stores";
import {
  automationWorkspaceMaxSubscribedViews,
  boundedAutomationWorkspaceViewIds,
} from "../workspace/shell/view-source";
import {
  createPhase11DeterministicScaleFixture,
  PHASE11_VISIBLE_WORK_BUDGETS,
} from "./phase11-deterministic-fixture";

describe("Phase 11 deterministic scale and state certification", () => {
  it("bounds hierarchy output by visible rows for a thousands-node fixture", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const window = selectAutomationHierarchyRowWindow({ rows: fixture.project.hierarchyNodes });

    expect(AUTOMATION_HIERARCHY_ROW_PAGE_SIZE).toBe(PHASE11_VISIBLE_WORK_BUDGETS.hierarchyRows);
    expect(window.rows).toHaveLength(PHASE11_VISIBLE_WORK_BUDGETS.hierarchyRows);
    expect(window.remaining).toBe(fixture.project.hierarchyNodes.length - PHASE11_VISIBLE_WORK_BUDGETS.hierarchyRows);
    expect(window.canLoadMore).toBe(true);
  });

  it("examines and subscribes to a fixed view budget even for one million logical IDs", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const priority = "view.999999";
    const bounded = boundedAutomationWorkspaceViewIds(fixture.logicalViewIds, priority);

    expect(automationWorkspaceMaxSubscribedViews).toBe(PHASE11_VISIBLE_WORK_BUDGETS.subscribedViews);
    expect(bounded).toHaveLength(PHASE11_VISIBLE_WORK_BUDGETS.subscribedViews);
    expect(bounded.at(-1)).toBe(priority);
    expect(fixture.logicalViewIds.reads()).toBeLessThanOrEqual(PHASE11_VISIBLE_WORK_BUDGETS.examinedViewIds);
    expect(fixture.logicalViewIds.highestReadIndex()).toBeLessThan(PHASE11_VISIBLE_WORK_BUDGETS.examinedViewIds);
  });

  it("preserves store identity and emits zero notifications for semantic no-ops at scale", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const store = createAutomationProjectDataStore();
    const notifications = vi.fn();
    store.subscribe(notifications, "entities:flows");

    expect(store.replaceAll("flows", fixture.flowEntries)).toBe(true);
    const state = store.getState();
    const ids = state.entityIds.flows;
    const flowMap = state.entities.flows;
    notifications.mockClear();

    expect(store.replaceAll("flows", fixture.flowEntries)).toBe(false);
    expect(store.getState()).toBe(state);
    expect(store.getState().entityIds.flows).toBe(ids);
    expect(store.getState().entities.flows).toBe(flowMap);
    expect(notifications).not.toHaveBeenCalled();
  });

  it("coalesces cross-store transactions to one notification per affected owner", () => {
    const stores = createAutomationStudioStores();
    const notifications = {
      catalog: vi.fn(),
      projectData: vi.fn(),
      queries: vi.fn(),
      selection: vi.fn(),
      runtime: vi.fn(),
    };
    stores.catalog.subscribe(notifications.catalog);
    stores.projectData.subscribe(notifications.projectData);
    stores.queries.subscribe(notifications.queries);
    stores.selection.subscribe(notifications.selection);
    stores.runtimeStatus.subscribe(notifications.runtime);
    const query = runQuery();

    stores.transaction(() => {
      stores.catalog.activate("project.scale");
      stores.catalog.setLoaded(true);
      stores.projectData.activate("project.scale");
      stores.projectData.setResource("phase11:first", 1);
      stores.projectData.setResource("phase11:second", 2);
      stores.queries.setLoading(query);
      stores.queries.setResult(query, { ids: ["run.1"], total: 1, updatedAt: 1 });
      stores.selection.select({ kind: "flow", id: "flow.1" });
      stores.selection.setBottomPreview("run.1");
      stores.runtimeStatus.setFlowRunState({ phase: "running", runId: "run.1" });
    });

    for (const notification of Object.values(notifications)) {
      expect(notification).toHaveBeenCalledTimes(1);
    }
  });

  it("caches selector factories and retains selected identities across unrelated writes", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const store = createAutomationProjectDataStore();
    store.replaceAll("flows", fixture.flowEntries);
    const selectMap = automationEntityMapSelector("flows");
    const selectCollection = automationEntityCollectionSelector("flows");
    const firstMap = selectMap(store.getState());
    const firstCollection = selectCollection(store.getState());

    expect(automationEntityMapSelector("flows")).toBe(selectMap);
    expect(automationEntityCollectionSelector("flows")).toBe(selectCollection);
    store.setResource("unrelated", { changed: true });
    expect(selectMap(store.getState())).toBe(firstMap);
    expect(selectCollection(store.getState())).toBe(firstCollection);
  });

  it("normalizes query identity and keeps bounded page selectors stable on unrelated results", () => {
    const fixture = createPhase11DeterministicScaleFixture();
    const store = createAutomationProjectQueryStore();
    const first = runQuery({ status: ["failed", "succeeded"], flowId: "flow.1" });
    const equivalent = runQuery({ flowId: "flow.1", status: ["failed", "succeeded"] });
    const unrelated = { ...runQuery(), scope: "instructions" };

    expect(automationQueryKey(equivalent)).toBe(automationQueryKey(first));
    expect(automationQuerySelector(equivalent)).toBe(automationQuerySelector(first));
    expect(automationQueryIdsSelector(equivalent)).toBe(automationQueryIdsSelector(first));

    store.setResult(first, {
      ids: fixture.firstRunPageIds,
      total: fixture.project.runs.length,
      updatedAt: 10,
    });
    const selected = automationQuerySelector(first)(store.getState());
    const selectedIds = automationQueryIdsSelector(first)(store.getState());
    expect(selectedIds).toHaveLength(PHASE11_VISIBLE_WORK_BUDGETS.runPageRows);

    store.setResult(unrelated, { ids: ["instruction.1"], total: 1, updatedAt: 11 });
    expect(automationQuerySelector(first)(store.getState())).toBe(selected);
    expect(automationQueryIdsSelector(first)(store.getState())).toBe(selectedIds);
    expect(store.setResult(first, {
      ids: [...fixture.firstRunPageIds],
      total: fixture.project.runs.length,
      updatedAt: 10,
    })).toBe(false);
  });

  it("rejects a stale same-project hydration after the shared generation advances", async () => {
    const runtime = createAutomationStudioRuntime();
    const pending: Array<(value: string) => void> = [];
    const commits: string[] = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: () => undefined,
      hydrate: () => new Promise<string>((resolve) => pending.push(resolve)),
      commit: (_projectId, summary) => commits.push(summary),
      fail: () => undefined,
      clear: () => undefined,
    }, runtime.projectGeneration);

    const stale = lifecycle.open("project.scale");
    const current = lifecycle.open("project.scale");
    pending[0]?.("stale");
    pending[1]?.("current");

    await expect(stale).resolves.toBe(false);
    await expect(current).resolves.toBe(true);
    expect(commits).toEqual(["current"]);
    runtime.dispose();
  });
});

function runQuery(filter: AutomationProjectQuery["filter"] = null): AutomationProjectQuery {
  return {
    projectId: "project.scale",
    scope: "runs",
    filter,
    sort: [{ field: "queuedAt", direction: "desc" }],
    page: 0,
    pageSize: PHASE11_VISIBLE_WORK_BUDGETS.runPageRows,
  };
}
