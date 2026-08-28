import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  AutomationStudioProjectSyncClient,
  applyAutomationStudioInvalidations,
  automationStudioInvalidationsFromChangePage,
  createAutomationStudioClientStores,
  type AutomationStudioFetchChangePage,
  type AutomationStudioProjectChangePage
} from "./project-sync";

describe("AutomationStudioProjectSyncClient", () => {
  it("maps feed events to scoped stores and cache scopes", () => {
    const page: AutomationStudioProjectChangePage = {
      cursor: 6,
      hasMore: false,
      events: [
        event(1, "hierarchy_entry", "entry.flow"),
        event(2, "graph_node", "node.1"),
        event(3, "recording_session", "recording.1"),
        event(4, "runtime_run", "run.1"),
        event(5, "state_snapshot", "state.1"),
        event(6, "adaptation", "adaptation.1")
      ]
    };

    const invalidations = automationStudioInvalidationsFromChangePage("project.1", page);

    expect(invalidations.map((item) => item.store)).toEqual(["hierarchy", "flow", "recording", "runtime", "state", "adaptation"]);
    expect(invalidations.find((item) => item.store === "flow")?.cacheScopes).toContain("flow");
    expect(invalidations.find((item) => item.store === "runtime")?.cacheScopes).toEqual(["summary"]);
  });

  it("keeps change-feed cache invalidation scoped to affected entities", () => {
    const page: AutomationStudioProjectChangePage = {
      cursor: 2,
      hasMore: false,
      events: [
        event(1, "subflow", "subflow.1", { parentId: "flow.1", hierarchyScope: { kind: "flow", id: "flow.1" } }),
        event(2, "flow", "flow.2")
      ]
    };

    const invalidations = automationStudioInvalidationsFromChangePage("project.1", page);

    expect(invalidations[0]?.cacheResourceIds).toEqual(["subflow.1", "flow.1", "flow.1:subflow.1"]);
    expect(invalidations[1]?.cacheResourceIds).toEqual(["flow.2"]);
    expect(invalidations.flatMap((item) => item.cacheResourceIds)).not.toContain("root");
  });

  it("marks payload-free creates and unsupported deletes as explicit recovery diagnostics", () => {
    const page: AutomationStudioProjectChangePage = {
      cursor: 2,
      hasMore: false,
      events: [
        event(1, "flow", "flow.created", { operation: "create" }),
        event(2, "graph_node", "node.deleted", { operation: "delete" })
      ]
    };

    const invalidations = automationStudioInvalidationsFromChangePage("project.1", page);

    expect(invalidations.map((item) => item.reconciliation.localAction)).toEqual(["recovery", "recovery"]);
    expect(invalidations[0]?.reconciliation.diagnostic).toContain("does not include entity payload data");
    expect(invalidations[1]?.reconciliation.diagnostic).toContain("no local reconciliation handler");
  });

  it("updates only the affected decomposed client stores", () => {
    const stores = createAutomationStudioClientStores();
    const flowListener = vi.fn();
    const recordingListener = vi.fn();
    stores.flow.subscribe(flowListener);
    stores.recording.subscribe(recordingListener);

    applyAutomationStudioInvalidations(stores, automationStudioInvalidationsFromChangePage("project.1", {
      cursor: 1,
      hasMore: false,
      events: [event(1, "graph_edge", "edge.1")]
    }));

    expect(flowListener).toHaveBeenCalledTimes(1);
    expect(recordingListener).not.toHaveBeenCalled();
    expect(stores.flow.version).toBe(1);
    expect(stores.recording.version).toBe(0);
  });

  it("uses reconnect cursors and backpressure without overlapping fetches", async () => {
    const pages: AutomationStudioProjectChangePage[] = [
      { cursor: 2, hasMore: false, events: [event(2, "flow", "flow.1")] },
      { cursor: 3, hasMore: false, events: [event(3, "runtime_run", "run.1")] }
    ];
    let releaseFirst: (() => void) | undefined;
    const fetchPage = vi.fn<AutomationStudioFetchChangePage>(async () => {
      if (fetchPage.mock.calls.length === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return pages.shift()!;
    });
    const statuses: string[] = [];
    const client = new AutomationStudioProjectSyncClient({
      projectId: "project.1",
      initialCursor: 1,
      fetchPage,
      registerSubscription: () => () => undefined,
      onStatus: (status) => statuses.push(status.state),
      windowRef: immediateWindow()
    });

    client.start();
    client.notifyMutation();
    client.notifyMutation();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("backpressure");
    if (releaseFirst) releaseFirst();
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({ afterSequence: 1 });
    expect(fetchPage.mock.calls[1]?.[0]).toMatchObject({ afterSequence: 2 });
    client.stop();
  });

  it("pauses while hidden and resumes from the same cursor", async () => {
    const documentRef = fakeDocument("hidden");
    const fetchPage = vi.fn<AutomationStudioFetchChangePage>(async () => ({ cursor: 4, hasMore: false, events: [event(4, "recording", "recording.1")] }));
    const client = new AutomationStudioProjectSyncClient({
      projectId: "project.1",
      initialCursor: 3,
      fetchPage,
      documentRef,
      registerSubscription: () => () => undefined,
      windowRef: immediateWindow()
    });

    client.start();
    client.notifyMutation();
    expect(fetchPage).not.toHaveBeenCalled();
    documentRef.visibilityState = "visible";
    documentRef.emit("visibilitychange");
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({ afterSequence: 3 });
    client.stop();
  });

  it("does not use idle application polling in the live Studio shell", () => {
    const source = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("project-context-heartbeat");
    expect(source).not.toContain("setInterval(() => void refreshGatewaySnapshot()");
    expect(source).not.toContain("dataCache.invalidateProject(activeProjectId)");
  });
});

function event(sequence: number, entityKind: string, entityId: string, override: Partial<AutomationStudioProjectChangePage["events"][number]> = {}) {
  return { sequence, transactionId: `tx.${sequence}`, entityKind, entityId, operation: "update" as const, revision: 1, changedAt: sequence * 100, ...override };
}

function immediateWindow(): Pick<Window, "setTimeout" | "clearTimeout"> {
  return {
    setTimeout: ((callback: () => void) => {
      void Promise.resolve().then(callback);
      return 1;
    }) as Window["setTimeout"],
    clearTimeout: (() => undefined) as Window["clearTimeout"]
  };
}

function fakeDocument(initialVisibility: DocumentVisibilityState) {
  const listeners = new Map<string, EventListener[]>();
  return {
    visibilityState: initialVisibility,
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) listener(new Event(type));
    }
  };
}
