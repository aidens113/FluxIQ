import { describe, expect, it, vi } from "vitest";
import {
  automationQueryCollectionScope,
  automationQueryIdsSelector,
  automationQueryKey,
  automationQueryProjectScope,
  automationQueryScope,
  automationQuerySelector,
  createAutomationProjectQueryStore,
  type AutomationProjectQuery
} from "./project-query-store";
import {
  automationEntityCollectionSelector,
  automationEntityDetailScope,
  automationEntityIdsSelector,
  automationEntityScope,
  automationEntitySelector,
  createAutomationProjectDataStore
} from "./project-data-store";
import { createAutomationStudioStores } from "./studio-stores";

const runsQuery: AutomationProjectQuery = {
  projectId: "project.one",
  scope: "runs",
  filter: { status: ["running", "failed"], owner: "me" },
  sort: [{ field: "createdAt", direction: "desc" }],
  page: 0,
  pageSize: 25
};

describe("Automation Studio project query store", () => {
  it("keys every normalized query dimension deterministically", () => {
    const equivalent = {
      ...runsQuery,
      filter: { owner: "me", status: ["running", "failed"] }
    };
    const dimensions: AutomationProjectQuery[] = [
      { ...runsQuery, projectId: "project.two" },
      { ...runsQuery, scope: "recordings" },
      { ...runsQuery, filter: { status: "complete" } },
      { ...runsQuery, sort: [{ field: "createdAt", direction: "asc" }] },
      { ...runsQuery, page: 1 },
      { ...runsQuery, pageSize: 50 }
    ];

    expect(automationQueryKey(equivalent)).toBe(automationQueryKey(runsQuery));
    expect(automationQuerySelector(equivalent)).toBe(automationQuerySelector(runsQuery));
    expect(new Set(dimensions.map(automationQueryKey))).toHaveLength(dimensions.length);
    for (const query of dimensions) {
      expect(automationQueryKey(query)).not.toBe(automationQueryKey(runsQuery));
    }
  });

  it("owns loading, error, freshness, and stable IDs per exact query", () => {
    const store = createAutomationProjectQueryStore();
    const otherQuery = { ...runsQuery, page: 1 };
    const runsListener = vi.fn();
    const otherListener = vi.fn();
    store.subscribe(runsListener, automationQueryScope(runsQuery));
    store.subscribe(otherListener, automationQueryScope(otherQuery));

    expect(store.getQuery(runsQuery)).toMatchObject({
      ids: [],
      loading: false,
      error: null,
      freshness: "missing"
    });
    expect(store.setLoading(runsQuery)).toBe(true);
    expect(store.getQuery(runsQuery).loading).toBe(true);
    expect(store.setError(runsQuery, "Unavailable")).toBe(true);
    expect(store.getQuery(runsQuery)).toMatchObject({
      loading: false,
      error: "Unavailable",
      freshness: "missing"
    });

    expect(store.setResult(runsQuery, {
      ids: ["run.1", "run.2", "run.1"],
      total: 2,
      updatedAt: 100
    })).toBe(true);
    const ids = store.getQuery(runsQuery).ids;
    expect(ids).toEqual(["run.1", "run.2"]);
    expect(store.getQuery(runsQuery)).toMatchObject({
      loading: false,
      error: null,
      freshness: "fresh",
      updatedAt: 100
    });
    expect(store.setLoading(runsQuery)).toBe(true);
    expect(store.getQuery(runsQuery).ids).toBe(ids);
    expect(store.markStale(runsQuery)).toBe(true);
    expect(store.getQuery(runsQuery).ids).toBe(ids);
    expect(otherListener).not.toHaveBeenCalled();
    expect(runsListener).toHaveBeenCalledTimes(5);
  });

  it("preserves selector and result references across unrelated writes", () => {
    const stores = createAutomationStudioStores();
    const selectFlowIds = automationEntityIdsSelector("flows");
    const selectFlows = automationEntityCollectionSelector("flows");
    const selectRunIds = automationQueryIdsSelector(runsQuery);

    stores.projectData.replaceAll("flows", [
      ["flow.1", { flowId: "flow.1" }],
      ["flow.2", { flowId: "flow.2" }]
    ]);
    stores.queries.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 });

    const flowIds = selectFlowIds(stores.projectData.getState());
    const flows = selectFlows(stores.projectData.getState());
    const runIds = selectRunIds(stores.queries.getState());

    stores.projectData.upsert("recordings", "recording.1", { recordingId: "recording.1" });
    stores.queries.setLoading(runsQuery);
    stores.queries.setError(runsQuery, "Retry");

    expect(automationEntityIdsSelector("flows")).toBe(selectFlowIds);
    expect(automationEntityCollectionSelector("flows")).toBe(selectFlows);
    expect(automationQueryIdsSelector({ ...runsQuery })).toBe(selectRunIds);
    expect(selectFlowIds(stores.projectData.getState())).toBe(flowIds);
    expect(selectFlows(stores.projectData.getState())).toBe(flows);
    expect(selectRunIds(stores.queries.getState())).toBe(runIds);
  });

  it("preserves collection results when multiple project stores are read interleaved", () => {
    const first = createAutomationProjectDataStore();
    const second = createAutomationProjectDataStore();
    const selectFlows = automationEntityCollectionSelector("flows");
    first.replaceAll("flows", [["flow.1", { flowId: "flow.1" }]]);
    second.replaceAll("flows", [["flow.2", { flowId: "flow.2" }]]);

    const firstResult = selectFlows(first.getState());
    const secondResult = selectFlows(second.getState());

    expect(firstResult).not.toBe(secondResult);
    expect(selectFlows(first.getState())).toBe(firstResult);
    expect(selectFlows(second.getState())).toBe(secondResult);
  });

  it("publishes bulk entity and detail changes only to affected exact scopes", () => {
    const store = createAutomationProjectDataStore();
    const first = { flowId: "flow.1", name: "First" };
    const second = { flowId: "flow.2", name: "Second" };
    store.replaceAll("flows", [["flow.1", first], ["flow.2", second]]);
    store.setDetailStatus("flows", "flow.1", "summary");

    const collection = vi.fn();
    const firstEntity = vi.fn();
    const secondEntity = vi.fn();
    const detailCollection = vi.fn();
    const firstDetail = vi.fn();
    const secondDetail = vi.fn();
    store.subscribe(collection, automationEntityScope("flows"));
    store.subscribe(firstEntity, automationEntityScope("flows", "flow.1"));
    store.subscribe(secondEntity, automationEntityScope("flows", "flow.2"));
    store.subscribe(detailCollection, automationEntityDetailScope("flows"));
    store.subscribe(firstDetail, automationEntityDetailScope("flows", "flow.1"));
    store.subscribe(secondDetail, automationEntityDetailScope("flows", "flow.2"));

    expect(store.replaceAll("flows", [["flow.1", first], ["flow.2", second]])).toBe(true);
    expect(collection).not.toHaveBeenCalled();
    expect(firstEntity).not.toHaveBeenCalled();
    expect(secondEntity).not.toHaveBeenCalled();
    expect(detailCollection).toHaveBeenCalledTimes(1);
    expect(firstDetail).toHaveBeenCalledTimes(1);
    expect(secondDetail).not.toHaveBeenCalled();

    const updatedSecond = { ...second, name: "Updated" };
    expect(store.replaceAll("flows", [["flow.2", updatedSecond]])).toBe(true);
    expect(collection).toHaveBeenCalledTimes(1);
    expect(firstEntity).toHaveBeenCalledTimes(1);
    expect(secondEntity).toHaveBeenCalledTimes(1);
    expect(automationEntitySelector("flows", "flow.1")(store.getState())).toBeUndefined();
    expect(automationEntitySelector("flows", "flow.2")(store.getState())).toBe(updatedSecond);
  });

  it("notifies zero unrelated subscribers for one domain mutation", () => {
    const stores = createAutomationStudioStores();
    const flowListener = vi.fn();
    const recordingListener = vi.fn();
    const queryListener = vi.fn();
    const runtimeListener = vi.fn();
    const catalogListener = vi.fn();
    stores.projectData.subscribe(flowListener, automationEntityScope("flows"));
    stores.projectData.subscribe(recordingListener, automationEntityScope("recordings"));
    stores.queries.subscribe(queryListener, automationQueryScope(runsQuery));
    stores.runtimeStatus.subscribe(runtimeListener, "flow-run");
    stores.catalog.subscribe(catalogListener, "projects");

    stores.projectData.upsert("flows", "flow.1", { flowId: "flow.1" });

    expect(flowListener).toHaveBeenCalledTimes(1);
    expect(recordingListener).not.toHaveBeenCalled();
    expect(queryListener).not.toHaveBeenCalled();
    expect(runtimeListener).not.toHaveBeenCalled();
    expect(catalogListener).not.toHaveBeenCalled();
  });

  it("keeps query mutations out of every normalized entity channel", () => {
    const stores = createAutomationStudioStores();
    const listeners = {
      flows: vi.fn(),
      recordings: vi.fn(),
      hierarchy: vi.fn()
    };
    stores.projectData.subscribe(listeners.flows, automationEntityScope("flows"));
    stores.projectData.subscribe(listeners.recordings, automationEntityScope("recordings"));
    stores.projectData.subscribe(listeners.hierarchy, automationEntityScope("hierarchy"));

    stores.queries.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 });

    expect(listeners.flows).not.toHaveBeenCalled();
    expect(listeners.recordings).not.toHaveBeenCalled();
    expect(listeners.hierarchy).not.toHaveBeenCalled();
  });

  it("advances only the exact independent revision channels", () => {
    const stores = createAutomationStudioStores();
    const otherQuery = { ...runsQuery, page: 1 };

    stores.queries.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 });
    expect(stores.queries.getRevision(automationQueryScope(runsQuery))).toBe(1);
    expect(stores.queries.getRevision(automationQueryScope(otherQuery))).toBe(0);

    stores.projectData.upsert("flows", "flow.1", { flowId: "flow.1" });
    expect(stores.projectData.getRevision(automationEntityScope("flows"))).toBe(1);
    expect(stores.projectData.getRevision(automationEntityScope("recordings"))).toBe(0);
    expect(stores.queries.getRevision(automationQueryScope(runsQuery))).toBe(1);
  });

  it("rejects incomplete or unbounded query descriptors", () => {
    expect(() => automationQueryKey({ ...runsQuery, projectId: " " })).toThrow(/projectId/);
    expect(() => automationQueryKey({ ...runsQuery, scope: "" })).toThrow(/scope/);
    expect(() => automationQueryKey({ ...runsQuery, page: -1 })).toThrow(/page/);
    expect(() => automationQueryKey({ ...runsQuery, pageSize: 0 })).toThrow(/pageSize/);
  });

  it("marks retained results stale on refresh error and updates explicit freshness timestamps", () => {
    const store = createAutomationProjectQueryStore();
    store.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 });
    const ids = store.getQuery(runsQuery).ids;

    expect(store.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 })).toBe(false);
    expect(store.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 200 })).toBe(true);
    expect(store.getQuery(runsQuery).ids).toBe(ids);
    expect(store.setLoading(runsQuery)).toBe(true);
    expect(store.setError(runsQuery, "Refresh failed")).toBe(true);
    expect(store.getQuery(runsQuery)).toMatchObject({
      ids,
      error: "Refresh failed",
      freshness: "stale",
      updatedAt: 200
    });
  });

  it("notifies exact, collection, and project scopes when clearing project queries", () => {
    const store = createAutomationProjectQueryStore();
    const recordingsQuery = { ...runsQuery, scope: "recordings" };
    const otherProjectQuery = { ...runsQuery, projectId: "project.two" };
    store.setResult(runsQuery, { ids: ["run.1"], total: 1, updatedAt: 100 });
    store.setResult(recordingsQuery, { ids: ["recording.1"], total: 1, updatedAt: 100 });
    store.setResult(otherProjectQuery, { ids: ["run.2"], total: 1, updatedAt: 100 });

    const exactRuns = vi.fn();
    const exactRecordings = vi.fn();
    const runsCollection = vi.fn();
    const recordingsCollection = vi.fn();
    const project = vi.fn();
    const otherProject = vi.fn();
    store.subscribe(exactRuns, automationQueryScope(runsQuery));
    store.subscribe(exactRecordings, automationQueryScope(recordingsQuery));
    store.subscribe(runsCollection, automationQueryCollectionScope("project.one", "runs"));
    store.subscribe(recordingsCollection, automationQueryCollectionScope("project.one", "recordings"));
    store.subscribe(project, automationQueryProjectScope("project.one"));
    store.subscribe(otherProject, automationQueryProjectScope("project.two"));

    expect(store.clearProject("project.one")).toBe(true);
    expect(exactRuns).toHaveBeenCalledTimes(1);
    expect(exactRecordings).toHaveBeenCalledTimes(1);
    expect(runsCollection).toHaveBeenCalledTimes(1);
    expect(recordingsCollection).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledTimes(1);
    expect(otherProject).not.toHaveBeenCalled();
    expect(store.getQuery(otherProjectQuery).freshness).toBe("fresh");
  });
});
