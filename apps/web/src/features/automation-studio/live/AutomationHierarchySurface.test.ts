import { describe, expect, it, vi } from "vitest";
import type { AutomationHierarchyNode } from "../hierarchy/contracts";
import { AutomationHierarchyBrowserPaging } from "../hierarchy/browser-hierarchy-paging";
import { automationHierarchyPageKey } from "../hierarchy/paged-cache";
import type {
  AutomationHierarchySiblingPageLoader,
  AutomationHierarchySiblingPageResponse
} from "../hierarchy/sibling-pager";
import {
  activateAutomationHierarchySurfaceProject,
  resolveAutomationHierarchySurfacePaging
} from "./AutomationHierarchySurface";

function node(id: string, parentId: string | null, label = id): AutomationHierarchyNode {
  return {
    id,
    label,
    kind: parentId ? "folder" : "flow",
    category: "flow",
    parentId,
    sourceId: id,
    ...(parentId ? {} : { flowId: id })
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutomationHierarchySurface paging", () => {
  it("activates the requested project with its static hierarchy nodes", async () => {
    const loader = vi.fn(async (_request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => ({ items: [], nextCursor: null, hasMore: false }));
    const paging = new AutomationHierarchyBrowserPaging(loader);
    const staticFlow = node("flow-a", null, "Flow A");
    const staticRouter = node("flow-a-router", "flow-a", "Router");

    const cleanup = activateAutomationHierarchySurfaceProject(
      paging,
      "project-a",
      { nodes: [staticFlow, staticRouter] }
    );
    await settle();

    expect(loader).toHaveBeenCalledOnce();
    expect(loader.mock.calls[0]?.[0]).toMatchObject({ projectId: "project-a", parentId: null });
    expect(paging.getSnapshot().projectId).toBe("project-a");
    expect(paging.getSnapshot().nodes).toContain(staticRouter);
    cleanup();
    paging.dispose();
  });

  it("merges later static nodes without reloading the root SQL page", async () => {
    const loader = vi.fn(async () => ({
      items: [node("flow-a", null, "Persisted flow")],
      nextCursor: null,
      hasMore: false
    }));
    const paging = new AutomationHierarchyBrowserPaging(loader);
    const cleanup = activateAutomationHierarchySurfaceProject(paging, "project-a", { nodes: [] });
    await settle();
    const settings = node("flow-a-settings", "flow-a", "Settings");

    paging.setStaticMerge({ nodes: [settings] });

    expect(loader).toHaveBeenCalledOnce();
    expect(new Set(paging.getSnapshot().nodes.map((item) => item.id))).toEqual(new Set([
      "flow-a",
      "flow-a-settings"
    ]));
    cleanup();
    paging.dispose();
  });

  it("forwards load-more through the current project surface state", async () => {
    const loader = vi.fn(async (request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => ({
      items: request.parentId === null
        ? [node("flow-a", null)]
        : [node("flow-a-child", request.parentId)],
      nextCursor: null,
      hasMore: false
    }));
    const paging = new AutomationHierarchyBrowserPaging(loader);
    const cleanup = activateAutomationHierarchySurfaceProject(paging, "project-a", { nodes: [] });
    await settle();
    const state = resolveAutomationHierarchySurfacePaging({
      nodes: [],
      paging,
      pagingSnapshot: paging.getSnapshot(),
      projectId: "project-a"
    });

    state.loadMoreChildren?.("flow-a");
    await settle();

    expect(loader.mock.calls.map(([request]) => request.parentId)).toEqual([null, "flow-a"]);
    expect(paging.getSnapshot().nodes.map((item) => item.id)).toContain("flow-a-child");
    expect(state.childPageInfo?.[automationHierarchyPageKey(null)]).toBeDefined();
    cleanup();
    paging.dispose();
  });

  it("switches projects without exposing a stale project result", async () => {
    const projectA = deferred<AutomationHierarchySiblingPageResponse>();
    const loader = vi.fn((request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => {
      if (request.projectId === "project-a") return projectA.promise;
      return Promise.resolve({ items: [node("flow-b", null)], nextCursor: null, hasMore: false });
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);
    const cleanupA = activateAutomationHierarchySurfaceProject(paging, "project-a", { nodes: [] });

    cleanupA();
    const cleanupB = activateAutomationHierarchySurfaceProject(paging, "project-b", { nodes: [] });
    await settle();
    projectA.resolve({ items: [node("flow-a", null)], nextCursor: null, hasMore: false });
    await settle();

    expect(paging.getSnapshot().projectId).toBe("project-b");
    expect(paging.getSnapshot().nodes.map((item) => item.id)).toEqual(["flow-b"]);
    expect(resolveAutomationHierarchySurfacePaging({
      nodes: [node("local-b", null)],
      paging,
      pagingSnapshot: paging.getSnapshot(),
      projectId: "project-a"
    }).nodes.map((item) => item.id)).toEqual(["local-b"]);
    cleanupB();
    paging.dispose();
  });

  it("resets and aborts the active project on surface cleanup", async () => {
    const request = deferred<AutomationHierarchySiblingPageResponse>();
    let signal: AbortSignal | undefined;
    const loader = vi.fn((input: Parameters<AutomationHierarchySiblingPageLoader>[0]) => {
      signal = input.signal;
      return request.promise;
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);
    const cleanup = activateAutomationHierarchySurfaceProject(paging, "project-a", {
      nodes: [node("local-a", null)]
    });
    await settle();

    cleanup();

    expect(signal?.aborted).toBe(true);
    expect(paging.getSnapshot()).toMatchObject({ projectId: null, nodes: [] });
    request.resolve({ items: [node("stale-a", null)], nextCursor: null, hasMore: false });
    await settle();
    expect(paging.getSnapshot().nodes).toEqual([]);
    paging.dispose();
  });

  it("preserves the static surface contract when paging is absent", () => {
    const staticNodes = [node("local-a", null)];
    const loadMoreChildren = vi.fn();
    const childPageInfo = {
      [automationHierarchyPageKey(null)]: { loadedCount: 1, hasMore: false, nextCursor: null }
    };

    const state = resolveAutomationHierarchySurfacePaging({
      nodes: staticNodes,
      childPageInfo,
      loadMoreChildren,
      pagingSnapshot: { projectId: null, nodes: [], childPageInfo: {} },
      projectId: "project-a"
    });

    expect(state.nodes).toBe(staticNodes);
    expect(state.childPageInfo).toBe(childPageInfo);
    expect(state.loadMoreChildren).toBe(loadMoreChildren);
  });
});