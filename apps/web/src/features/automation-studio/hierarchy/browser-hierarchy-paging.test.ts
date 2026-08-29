import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../data/program-transport";
import { automationHierarchyPageKey } from "./paged-cache";
import type { AutomationHierarchyNode } from "./contracts";
import { AutomationHierarchyBrowserPaging } from "./browser-hierarchy-paging";
import {
  AUTOMATION_HIERARCHY_CHILDREN_ENDPOINT,
  createAutomationHierarchyChildrenTransport
} from "./browser-hierarchy-transport";
import type {
  AutomationHierarchySiblingPageLoader,
  AutomationHierarchySiblingPageResponse
} from "./sibling-pager";

const staticRouter: AutomationHierarchyNode = {
  id: "flow-a-router",
  label: "Router",
  kind: "flow-object",
  category: "flow",
  parentId: "flow-a",
  viewId: "flow-router",
  sourceId: "flow.a",
  flowId: "flow.a"
};

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

function sqlEntry(id: string, parentId: string | null, overrides: Record<string, unknown> = {}) {
  return {
    entryId: id,
    parentEntryId: parentId,
    kind: parentId ? "folder" : "flow",
    ownerId: id,
    displayName: id,
    sortKey: id,
    depth: parentId ? 1 : 0,
    pathKey: "/" + id,
    isSystem: false,
    isDeleted: false,
    revision: 1,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("hierarchy SQL browser transport", () => {
  it("posts a bounded direct-sibling request and maps only valid requested-parent entries", async () => {
    const post = vi.fn(async (
      _endpoint: string,
      _payload: Record<string, unknown>,
      _options?: { signal?: AbortSignal }
    ) => ({
      ok: true,
      payload: {
        page: {
          items: [
            sqlEntry("child-a", "flow-a"),
            sqlEntry("descendant", "child-a"),
            sqlEntry("deleted", "flow-a", { isDeleted: true })
          ],
          nextCursor: "cursor.2",
          hasMore: true
        }
      }
    }));
    const loader = createAutomationHierarchyChildrenTransport({
      post
    } as unknown as Pick<ProgramCommandTransport, "post">);
    const signal = new AbortController().signal;

    const page = await loader({
      projectId: "project-a",
      parentId: "flow-a",
      cursor: "cursor.1",
      limit: 100,
      signal
    });

    expect(post).toHaveBeenCalledWith(
      AUTOMATION_HIERARCHY_CHILDREN_ENDPOINT,
      {
        projectId: "project-a",
        parentId: "flow-a",
        cursor: "cursor.1",
        limit: 100
      },
      { signal }
    );
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("descendantIds");
    expect(page?.items?.map((item) => item.id)).toEqual(["child-a"]);
    expect(page).toMatchObject({ nextCursor: "cursor.2", hasMore: true });
  });
});

describe("AutomationHierarchyBrowserPaging", () => {
  it("loads an initial root page, then only the requested child sibling page", async () => {
    const loader = vi.fn(async (request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => {
      if (request.parentId === null) {
        return { items: [node("flow-a", null)], nextCursor: null, hasMore: false };
      }
      return { items: [node("child-a", request.parentId)], nextCursor: null, hasMore: false };
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);

    await paging.activateProject("project-a", { nodes: [staticRouter] });
    await paging.loadMoreChildren("flow-a");

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.map(([request]) => ({
      projectId: request.projectId,
      parentId: request.parentId,
      cursor: request.cursor,
      limit: request.limit
    }))).toEqual([
      { projectId: "project-a", parentId: null, cursor: null, limit: 100 },
      { projectId: "project-a", parentId: "flow-a", cursor: null, limit: 100 }
    ]);
    expect(new Set(paging.getSnapshot().nodes.map((item) => item.id))).toEqual(new Set([
      "flow-a",
      "child-a",
      "flow-a-router"
    ]));
    expect(paging.getSnapshot().childPageInfo[automationHierarchyPageKey("flow-a")]).toMatchObject({
      loadedCount: 2,
      hasMore: false,
      nextCursor: null
    });
  });

  it("advances a single parent cursor and deduplicates repeated entries", async () => {
    const loader = vi.fn(async (request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => {
      if (request.parentId === null) {
        return { items: [node("flow-a", null)], nextCursor: null, hasMore: false };
      }
      if (request.cursor === null) {
        return {
          items: [node("child-a", "flow-a"), node("child-b", "flow-a")],
          nextCursor: "cursor.2",
          hasMore: true
        };
      }
      return {
        items: [node("child-b", "flow-a"), node("child-c", "flow-a")],
        nextCursor: null,
        hasMore: false
      };
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);

    await paging.activateProject("project-a");
    await paging.loadMoreChildren("flow-a");
    await paging.loadMoreChildren("flow-a");

    expect(loader.mock.calls.at(-1)?.[0]).toMatchObject({
      parentId: "flow-a",
      cursor: "cursor.2"
    });
    expect(paging.getSnapshot().nodes.filter((item) => item.parentId === "flow-a").map((item) => item.id)).toEqual([
      "child-a",
      "child-b",
      "child-c"
    ]);
  });

  it("keeps explicit static nodes authoritative when SQL returns the same ID", async () => {
    const staticFlow = node("flow-a", null, "Local flow label");
    const loader = vi.fn(async () => ({
      items: [node("flow-a", null, "Persisted flow label")],
      nextCursor: null,
      hasMore: false
    }));
    const paging = new AutomationHierarchyBrowserPaging(loader);

    await paging.activateProject("project-a", { nodes: [staticFlow] });

    expect(paging.getSnapshot().nodes).toEqual([staticFlow]);
    expect(paging.getSnapshot().nodes[0]).toBe(staticFlow);
  });

  it("resets on project switches and ignores stale responses even when a loader ignores abort", async () => {
    const projectA = deferred<AutomationHierarchySiblingPageResponse>();
    const loader = vi.fn((request: Parameters<AutomationHierarchySiblingPageLoader>[0]) => {
      if (request.projectId === "project-a") return projectA.promise;
      return Promise.resolve({
        items: [node("flow-b", null)],
        nextCursor: null,
        hasMore: false
      });
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);

    const firstActivation = paging.activateProject("project-a");
    await paging.activateProject("project-b");
    projectA.resolve({
      items: [node("flow-a", null)],
      nextCursor: null,
      hasMore: false
    });
    await firstActivation;

    expect(paging.getSnapshot().projectId).toBe("project-b");
    expect(paging.getSnapshot().nodes.map((item) => item.id)).toEqual(["flow-b"]);
  });

  it("publishes page errors and retries the same sibling page", async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("Database unavailable");
      return {
        items: [node("flow-a", null)],
        nextCursor: null,
        hasMore: false
      };
    });
    const paging = new AutomationHierarchyBrowserPaging(loader);

    await paging.activateProject("project-a");
    expect(paging.getSnapshot().childPageInfo[automationHierarchyPageKey(null)]).toMatchObject({
      error: "Database unavailable"
    });
    expect(paging.getSnapshot().childPageInfo[automationHierarchyPageKey(null)]?.loading).toBeUndefined();

    await paging.retryChildren(null);
    expect(paging.getSnapshot().nodes.map((item) => item.id)).toEqual(["flow-a"]);
    expect(paging.getSnapshot().childPageInfo[automationHierarchyPageKey(null)]?.error).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps stable snapshots for repeated activation with identical merge inputs", async () => {
    const staticNodes = [node("flow-a", null)];
    const loader = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      hasMore: false
    }));
    const paging = new AutomationHierarchyBrowserPaging(loader);

    await paging.activateProject("project-a", { nodes: staticNodes });
    const first = paging.getSnapshot();
    await paging.activateProject("project-a", { nodes: staticNodes });

    expect(paging.getSnapshot()).toBe(first);
    expect(paging.getSnapshot().nodes).toBe(first.nodes);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
