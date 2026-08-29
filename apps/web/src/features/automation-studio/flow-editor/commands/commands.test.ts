import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_FLOW_ENDPOINTS,
  deprecateAutomationFlow,
  discardAutomationFlowDraft,
  loadAutomationFlowDetail,
  loadAutomationNodeDefinitions,
  persistAutomationFlowDraft,
  publishAutomationFlow,
  resolveAutomationSubflowEditor,
  restoreAutomationFlowDraft,
  runCurrentAutomationFlow,
  saveAutomationFlowDraft,
  updateAutomationFlowDraft,
  type AutomationFlowCommandScope,
  type AutomationFlowDraftRepository,
  type AutomationFlowReadCache
} from ".";

const scope: AutomationFlowCommandScope = { projectId: "project.one", generation: 1 };

function createCapabilities(post = vi.fn()) {
  let current = scope;
  return {
    api: { post },
    isCurrent: (candidate: AutomationFlowCommandScope) =>
      candidate.projectId === current.projectId && candidate.generation === current.generation,
    setCurrent(next: AutomationFlowCommandScope) {
      current = next;
    }
  };
}

function createCache(): AutomationFlowReadCache {
  const values = new Map<string, unknown>();
  const key = (kind: string, projectId: string, resourceId: string) => [kind, projectId, resourceId].join(":");
  return {
    get<T>(kind: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string) {
      return (values.get(key(kind, projectId, resourceId)) as T | undefined) ?? null;
    },
    set<T>(kind: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string, value: T) {
      values.set(key(kind, projectId, resourceId), value);
      return value;
    }
  };
}

function createDraftRepository(): AutomationFlowDraftRepository & {
  removeSnapshot: ReturnType<typeof vi.fn>;
  removeOperations: ReturnType<typeof vi.fn>;
  saveSnapshot: ReturnType<typeof vi.fn>;
  saveOperations: ReturnType<typeof vi.fn>;
} {
  return {
    loadSnapshot: vi.fn().mockReturnValue(null),
    saveSnapshot: vi.fn().mockReturnValue(true),
    removeSnapshot: vi.fn(),
    saveOperations: vi.fn().mockResolvedValue(true),
    removeOperations: vi.fn().mockResolvedValue(undefined)
  } as any;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Flow detail and node-definition commands", () => {
  it("loads and caches Flow detail through the owned endpoint", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { flow: { flowId: "flow.one" } } });
    const capabilities = createCapabilities(post);
    const cache = createCache();

    await expect(loadAutomationFlowDetail({ scope, flowId: "flow.one" }, { ...capabilities, cache })).resolves.toEqual({
      status: "success",
      value: { flow: { flowId: "flow.one" }, source: "network" }
    });
    await expect(loadAutomationFlowDetail({ scope, flowId: "flow.one" }, { ...capabilities, cache })).resolves.toMatchObject({
      status: "success",
      value: { source: "cache" }
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(AUTOMATION_FLOW_ENDPOINTS.detail, { projectId: "project.one", flowId: "flow.one" }, {});
  });

  it("returns explicit failures and preflight cancellation", async () => {
    const post = vi.fn().mockResolvedValue({ ok: false, error: "missing" });
    const capabilities = createCapabilities(post);
    await expect(loadAutomationFlowDetail({ scope, flowId: "flow.missing" }, capabilities)).resolves.toEqual({
      status: "failure",
      error: "missing"
    });

    const controller = new AbortController();
    controller.abort();
    await expect(loadAutomationFlowDetail({ scope, flowId: "flow.one", signal: controller.signal }, capabilities)).resolves.toMatchObject({
      status: "cancelled"
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("rejects a detail response from a stale project generation", async () => {
    const request = deferred<any>();
    const capabilities = createCapabilities(vi.fn().mockReturnValue(request.promise));
    const result = loadAutomationFlowDetail({ scope, flowId: "flow.one" }, capabilities);
    capabilities.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: { flow: { flowId: "flow.one" } } });
    await expect(result).resolves.toMatchObject({ status: "stale" });
  });

  it("loads both node-definition catalogs as one result", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { nodes: [{ id: "native" }] } })
      .mockResolvedValueOnce({ ok: true, payload: { nodes: [{ id: "published" }] } });
    const capabilities = createCapabilities(post);
    await expect(loadAutomationNodeDefinitions({ scope }, capabilities)).resolves.toEqual({
      status: "success",
      value: { native: [{ id: "native" }], published: [{ id: "published" }], source: "network" }
    });
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      AUTOMATION_FLOW_ENDPOINTS.nativeNodeDefinitions,
      AUTOMATION_FLOW_ENDPOINTS.publishedFlowNodes
    ]);
  });
});

describe("subflow editor resolution", () => {
  it("uses a known graph Flow without a request", async () => {
    const capabilities = createCapabilities();
    await expect(resolveAutomationSubflowEditor({
      scope,
      parentFlowId: "flow.parent",
      subflowId: "subflow.one",
      knownGraphFlowId: "flow.graph"
    }, capabilities)).resolves.toEqual({
      status: "success",
      value: { graphFlowId: "flow.graph", source: "known" }
    });
    expect(capabilities.api.post).not.toHaveBeenCalled();
  });

  it("resolves from the endpoint and reports missing graphs", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { subflow: { graphFlowId: "flow.graph" } } })
      .mockResolvedValueOnce({ ok: true, payload: { subflow: {} } });
    const capabilities = createCapabilities(post);
    await expect(resolveAutomationSubflowEditor({ scope, parentFlowId: "flow.parent", subflowId: "one" }, capabilities)).resolves.toMatchObject({
      status: "success",
      value: { graphFlowId: "flow.graph", source: "network" }
    });
    await expect(resolveAutomationSubflowEditor({ scope, parentFlowId: "flow.parent", subflowId: "two" }, capabilities)).resolves.toMatchObject({
      status: "failure"
    });
  });
});

describe("run-current-Flow command", () => {
  it("runs the saved Flow with explicitly granted bound domains", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { runtimeSession: { runId: "run.one" } } });
    const capabilities = createCapabilities(post);
    await expect(runCurrentAutomationFlow({
      scope,
      flow: {
        flowId: "flow.one",
        scope: { kind: "global" },
        executionDefaults: { authorizedDomainIds: ["domain.one"] }
      },
      hasUnsavedChanges: true,
      allowSavedVersionWhenDirty: true,
      allowRequestedDomains: true
    }, capabilities)).resolves.toEqual({
      status: "success",
      value: { session: { runId: "run.one" }, requestedDomainIds: ["domain.one"] }
    });
    expect(post).toHaveBeenCalledWith(AUTOMATION_FLOW_ENDPOINTS.run, {
      projectId: "project.one",
      flowId: "flow.one",
      authorizedDomainIds: ["domain.one"]
    }, {});
  });

  it("cancels before I/O when dirty or domain permission is not granted", async () => {
    const capabilities = createCapabilities();
    const flow = { flowId: "flow.one", scope: { kind: "global" }, executionDefaults: { authorizedDomainIds: ["domain.one"] } };
    await expect(runCurrentAutomationFlow({
      scope, flow, hasUnsavedChanges: true, allowSavedVersionWhenDirty: false, allowRequestedDomains: true
    }, capabilities)).resolves.toMatchObject({ status: "cancelled" });
    await expect(runCurrentAutomationFlow({
      scope, flow, hasUnsavedChanges: false, allowSavedVersionWhenDirty: true, allowRequestedDomains: false
    }, capabilities)).resolves.toMatchObject({ status: "cancelled" });
    expect(capabilities.api.post).not.toHaveBeenCalled();
  });

  it("turns aborted requests into cancellation and stale responses into stale outcomes", async () => {
    const aborted = createCapabilities(vi.fn().mockResolvedValue({ ok: false, aborted: true, error: "cancelled" }));
    await expect(runCurrentAutomationFlow({
      scope, flow: { flowId: "flow.one" }, hasUnsavedChanges: false, allowSavedVersionWhenDirty: true, allowRequestedDomains: true
    }, aborted)).resolves.toEqual({ status: "cancelled", reason: "cancelled" });

    const request = deferred<any>();
    const stale = createCapabilities(vi.fn().mockReturnValue(request.promise));
    const result = runCurrentAutomationFlow({
      scope, flow: { flowId: "flow.one" }, hasUnsavedChanges: false, allowSavedVersionWhenDirty: true, allowRequestedDomains: true
    }, stale);
    stale.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: { runtimeSession: { runId: "stale" } } });
    await expect(result).resolves.toMatchObject({ status: "stale" });
  });
});

describe("Flow draft commands", () => {
  const graph = {
    nodes: [{ id: "node.one", position: { x: 0, y: 0 }, data: { label: "One" } }],
    edges: []
  };

  it("restores only current-project recoverable drafts", () => {
    const guard = createCapabilities();
    expect(restoreAutomationFlowDraft({
      scope,
      draftKey: "flow.one:1",
      draft: { projectId: "project.one", flowId: "flow.one", savedAt: 1, graph }
    }, guard)).toMatchObject({ status: "success", value: { draftKey: "flow.one:1", graph } });
    expect(restoreAutomationFlowDraft({
      scope,
      draftKey: "flow.one:1",
      draft: { projectId: "project.two", flowId: "flow.one", savedAt: 1, graph }
    }, guard)).toMatchObject({ status: "stale" });
  });

  it("persists full recovery snapshots and operation updates", async () => {
    const drafts = createDraftRepository();
    const capabilities = { ...createCapabilities(), drafts };
    expect(persistAutomationFlowDraft({
      scope, flowId: "flow.one", baseUpdatedAt: 10, savedAt: 20, graph
    }, capabilities)).toEqual({ status: "success", value: { savedAt: 20 } });
    await expect(updateAutomationFlowDraft({
      scope,
      flowId: "flow.one",
      graph: { ...graph, nodes: [...graph.nodes, { id: "node.two", position: { x: 2, y: 2 }, data: { label: "Two" } }] },
      baseGraph: graph,
      baseRevision: "rev.1",
      baseUpdatedAt: 10,
      savedAt: 20
    }, capabilities)).resolves.toMatchObject({ status: "success", value: { persisted: true, operationCount: 1 } });
    expect(drafts.saveSnapshot).toHaveBeenCalled();
    expect(drafts.saveOperations).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project.one",
      flowId: "flow.one",
      baseRevision: "rev.1",
      savedAt: 20
    }));
  });

  it("reports storage failure, cancellation, and successful discard", async () => {
    const drafts = createDraftRepository();
    drafts.saveSnapshot.mockReturnValue(false);
    const capabilities = { ...createCapabilities(), drafts };
    expect(persistAutomationFlowDraft({ scope, flowId: "flow.one", baseUpdatedAt: 1, graph }, capabilities)).toMatchObject({
      status: "failure",
      code: "DRAFT_STORAGE_UNAVAILABLE"
    });

    const controller = new AbortController();
    controller.abort();
    await expect(updateAutomationFlowDraft({
      scope, flowId: "flow.one", graph, baseGraph: graph, baseRevision: "one", baseUpdatedAt: 1, signal: controller.signal
    }, capabilities)).resolves.toMatchObject({ status: "cancelled" });

    await expect(discardAutomationFlowDraft({ scope, flowId: "flow.one" }, capabilities)).resolves.toEqual({
      status: "success",
      value: { flowId: "flow.one" }
    });
    expect(drafts.removeSnapshot).toHaveBeenCalledWith("project.one", "flow.one");
    expect(drafts.removeOperations).toHaveBeenCalledWith("project.one", "flow.one");
  });

  it("saves canonical graph data and clears recovery only after success", async () => {
    const savedFlow = { flowId: "flow.one", name: "Flow", nodes: [], edges: [], updatedAt: 20 };
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { flow: savedFlow } });
    const capabilities = { ...createCapabilities(post), drafts: createDraftRepository() };
    await expect(saveAutomationFlowDraft({
      scope,
      flow: { schemaVersion: "0.1", flowId: "flow.one", ownerKind: "project", ownerId: "project.one", name: "Flow", description: "", nodes: [], edges: [], createdAt: 1, updatedAt: 10 } as any,
      graph,
      authorizationPin: "1234",
      canonical: true
    }, capabilities)).resolves.toMatchObject({ status: "success", value: { flowId: "flow.one" } });
    expect(post).toHaveBeenCalledWith(AUTOMATION_FLOW_ENDPOINTS.save, expect.objectContaining({
      projectId: "project.one",
      authorizationPin: "1234",
      flow: expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) })
    }), {});
    expect(capabilities.drafts.removeSnapshot).toHaveBeenCalled();
    expect(capabilities.drafts.removeOperations).toHaveBeenCalled();
  });

  it("preserves recovery on conflict and on stale mutation completion", async () => {
    const conflictDrafts = createDraftRepository();
    const conflict = { ...createCapabilities(vi.fn().mockResolvedValue({ ok: false, error: "FLOW_SAVE_CONFLICT" })), drafts: conflictDrafts };
    const flow = { schemaVersion: "0.1", flowId: "flow.one", ownerKind: "project", ownerId: "project.one", name: "Flow", description: "", nodes: [], edges: [], createdAt: 1, updatedAt: 10 } as any;
    await expect(saveAutomationFlowDraft({ scope, flow, graph, authorizationPin: "1234", canonical: true }, conflict)).resolves.toMatchObject({
      status: "failure",
      code: "FLOW_SAVE_CONFLICT"
    });
    expect(conflictDrafts.removeSnapshot).not.toHaveBeenCalled();

    const request = deferred<any>();
    const staleDrafts = createDraftRepository();
    const stale = { ...createCapabilities(vi.fn().mockReturnValue(request.promise)), drafts: staleDrafts };
    const result = saveAutomationFlowDraft({ scope, flow, graph, authorizationPin: "1234", canonical: true }, stale);
    stale.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: { flow } });
    await expect(result).resolves.toMatchObject({ status: "stale" });
    expect(staleDrafts.removeSnapshot).not.toHaveBeenCalled();
  });
});

describe("Flow publication commands", () => {
  it("publishes and deprecates through owned endpoints", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { publication: { id: "pub.one" } } })
      .mockResolvedValueOnce({ ok: true, payload: {} });
    const capabilities = createCapabilities(post);
    await expect(publishAutomationFlow({
      scope, flowId: "flow.one", version: "1.0.0", changelog: "Ready", publishedBy: "User", authorizationPin: "1234"
    }, capabilities)).resolves.toMatchObject({ status: "success", value: { version: "1.0.0" } });
    await expect(deprecateAutomationFlow({
      scope, flowId: "flow.one", version: "1.0.0", reason: "Old", authorizationPin: "1234"
    }, capabilities)).resolves.toMatchObject({ status: "success", value: { version: "1.0.0" } });
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      AUTOMATION_FLOW_ENDPOINTS.publish,
      AUTOMATION_FLOW_ENDPOINTS.deprecate
    ]);
  });

  it("returns validation failure, request failure, cancellation, and stale results", async () => {
    const failed = createCapabilities(vi.fn().mockResolvedValue({ ok: false, error: "denied" }));
    await expect(publishAutomationFlow({
      scope, flowId: "flow.one", version: "", changelog: "", publishedBy: "User", authorizationPin: "1234"
    }, failed)).resolves.toMatchObject({ status: "failure", code: "VERSION_REQUIRED" });
    await expect(deprecateAutomationFlow({
      scope, flowId: "flow.one", version: "1", reason: "Old", authorizationPin: "1234"
    }, failed)).resolves.toEqual({ status: "failure", error: "denied" });

    const controller = new AbortController();
    controller.abort();
    await expect(publishAutomationFlow({
      scope, flowId: "flow.one", version: "1", changelog: "", publishedBy: "User", authorizationPin: "1234", signal: controller.signal
    }, failed)).resolves.toMatchObject({ status: "cancelled" });

    const request = deferred<any>();
    const stale = createCapabilities(vi.fn().mockReturnValue(request.promise));
    const result = publishAutomationFlow({
      scope, flowId: "flow.one", version: "1", changelog: "", publishedBy: "User", authorizationPin: "1234"
    }, stale);
    stale.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: {} });
    await expect(result).resolves.toMatchObject({ status: "stale" });
  });
});
