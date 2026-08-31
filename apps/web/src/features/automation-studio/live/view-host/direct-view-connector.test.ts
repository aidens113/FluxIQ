import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioStores } from "../../stores/studio-stores";
import { automationEntityScope } from "../../stores/project-data-store";
import { createAutomationConnectedViewHostRequest } from "../../views/view-host-types";
import { resolveAutomationDirectViewReadiness } from "./direct-view-connector";
import { createAutomationDirectViewConnector } from "./direct-view-connector";
import { selectAutomationConnectorFlow, type AutomationCanonicalConnectorScope } from "./canonical-connected-views";

const query = {
  projectId: "project-a",
  scope: "runs",
  page: 0,
  pageSize: 25
};

describe("direct view connector readiness", () => {
  it("rejects non-callable scope declarations when a connector is registered", () => {
    expect(() => createAutomationDirectViewConnector({
      id: "runtime-debug",
      placeholder: () => ({} as never),
      projectScopes: ["entity:runs"] as never,
      selectModel: () => ({} as never)
    })).toThrow("projectScopes must be a function");
  });

  it("stores a connector reference without evaluating destination model work", () => {
    const connect = vi.fn(() => null);
    const request = createAutomationConnectedViewHostRequest({
      id: "runtime-debug",
      label: "Runtime Debug",
      type: "runtime",
      icon: (() => null) as never
    }, connect);

    expect(connect).not.toHaveBeenCalled();
    expect(request.connect).toBe(connect);
  });

  it("keeps connector subscriptions and rendering inside the destination host", () => {
    const connector = readFileSync(new URL("./direct-view-connector.tsx", import.meta.url), "utf8");
    const host = readFileSync(new URL("../../views/ViewHost.tsx", import.meta.url), "utf8");

    expect(connector).not.toMatch(/AutomationCanonicalViewPublisher|WorkspaceViewSource/);
    expect(connector).toContain("const active = props.activity.active");
    expect(connector).toContain("if (!active) return () => undefined;");
    expect(connector).toContain("if (!active) return retainedSelection.current.value;");
    expect(host).toContain('if ("connect" in props.request) return props.request.connect(activity);');
  });

  it("delivers entity updates to the active connector while Session stays unsubscribed and commands read current state", () => {
    const stores = createAutomationStudioStores();
    const session = readFileSync(new URL("../AutomationStudioSession.tsx", import.meta.url), "utf8");
    const scope = {
      projectId: "project-a",
      getWorkspacePrefs: () => ({ viewStates: {} }) as any,
      loadFlowDetail: vi.fn(),
      loadFlowMetadata: vi.fn(),
      loadNodeDefinitions: vi.fn(),
      loadRecording: vi.fn(),
      loadTimeline: vi.fn()
    } satisfies AutomationCanonicalConnectorScope;
    stores.selection.select({ kind: "flow", id: "flow-a" });
    stores.projectData.upsert("flows", "flow-a", {
      source: "canonical",
      flow: { flowId: "flow-a", name: "Before" }
    });
    const activeConnectorRender = vi.fn();
    const sessionRender = vi.fn();
    const unsubscribe = stores.projectData.subscribe(activeConnectorRender, automationEntityScope("flows"));
    const readCommandSnapshot = () => selectAutomationConnectorFlow({
      projectData: stores.projectData.getState(),
      runtimeStatus: stores.runtimeStatus.getState(),
      selection: stores.selection.getState()
    }, scope).flow?.name;

    stores.projectData.upsert("flows", "flow-a", {
      source: "canonical",
      flow: { flowId: "flow-a", name: "After" }
    });

    expect(activeConnectorRender).toHaveBeenCalledTimes(1);
    expect(sessionRender).not.toHaveBeenCalled();
    expect(readCommandSnapshot()).toBe("After");
    expect(session).not.toMatch(/useAutomationProjectEntityCollection|useAutomationProjectDataResource|useAutomationSelectionState/u);
    unsubscribe();
  });

  it("keeps a missing bounded query local to the destination loading state", () => {
    const stores = createAutomationStudioStores();
    const snapshot = stores.queries.getQuery(query);

    expect(resolveAutomationDirectViewReadiness({
      model: { rows: [] },
      projectGeneration: 4,
      query: snapshot,
      empty: true
    })).toMatchObject({
      status: "loading",
      token: { projectGeneration: 4, requestToken: 0 }
    });
  });

  it("retains cached model data while a query refreshes or becomes stale", () => {
    const stores = createAutomationStudioStores();
    stores.queries.setResult(query, { ids: ["run-1"], total: 1, updatedAt: 12 });
    stores.queries.markStale(query);
    const model = { rows: [{ id: "run-1" }] };

    const readiness = resolveAutomationDirectViewReadiness({
      model,
      projectGeneration: 7,
      query: stores.queries.getQuery(query),
      empty: false
    });

    expect(readiness).toMatchObject({
      status: "stale-ready",
      data: model,
      token: { projectGeneration: 7, requestToken: 12 }
    });
  });

  it("distinguishes a fresh empty page from a failed initial query", () => {
    const stores = createAutomationStudioStores();
    stores.queries.setResult(query, { ids: [], total: 0, updatedAt: 20 });
    expect(resolveAutomationDirectViewReadiness({
      model: { rows: [] },
      projectGeneration: 1,
      query: stores.queries.getQuery(query),
      empty: true
    }).status).toBe("empty");

    stores.queries.remove(query);
    stores.queries.setError(query, "Unable to load runs");
    const failed = resolveAutomationDirectViewReadiness({
      model: { rows: [] },
      projectGeneration: 2,
      query: stores.queries.getQuery(query),
      empty: true
    });
    expect(failed.status).toBe("error");
    expect(failed.status === "error" ? failed.error.message : "").toBe("Unable to load runs");
  });
});
