import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import { createAutomationProjectCatalogStore } from "../stores";
import {
  createAutomationProject,
  createAutomationProjectCategory,
  deleteAutomationProject,
  deleteAutomationProjectCategory,
  moveAutomationProject,
  renameAutomationProject,
  renameAutomationProjectCategory,
  reorderAutomationProjectCategories
} from "./project-catalog-commands";
import { loadAutomationProjectCatalog } from "./project-catalog-queries";
import { loadAutomationProjectHydration } from "./project-hydration";
import { createAutomationProjectLifecycle } from "./project-lifecycle";
import { AutomationProjectDeepLinkAdapter } from "./use-project-lifecycle";

describe("Automation Studio Phase 4 project ownership", () => {
  it("claims each project deep link once without reopening the active project", () => {
    const adapter = new AutomationProjectDeepLinkAdapter();
    expect(adapter.claim("project.one", null)).toBe("project.one");
    expect(adapter.claim("project.one", null)).toBeNull();
    expect(adapter.claim("project.one", "project.one")).toBeNull();
    expect(adapter.claim("project.two", "project.one")).toBe("project.two");
  });

  it("aborts lifecycle hydration before clearing and resets after failure", async () => {
    let signal: AbortSignal | undefined;
    const order: string[] = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: () => order.push("shell"),
      hydrate: (_projectId, nextSignal) => {
        signal = nextSignal;
        return new Promise<string>(() => undefined);
      },
      commit: () => order.push("commit"),
      fail: () => order.push("fail"),
      clear: () => order.push(signal?.aborted ? "clear:aborted" : "clear:live")
    });
    void lifecycle.open("project.one");
    lifecycle.close();
    expect(order).toEqual(["shell", "clear:aborted"]);

    const failing = createAutomationProjectLifecycle({
      publishOpening: () => undefined,
      hydrate: async () => { throw new Error("No access"); },
      commit: () => undefined,
      fail: (_projectId, error) => order.push((error as Error).message),
      clear: () => undefined
    });
    await expect(failing.open("project.denied")).resolves.toBe(false);
    expect(failing.activeProjectId()).toBeNull();
    expect(order).toContain("No access");
  });

  it("hydrates hierarchy and bounded summary through project-owned queries", async () => {
    const api = {
      post: vi.fn(async (endpoint: string, _payload: unknown, options: { signal?: AbortSignal }) => {
        if (endpoint === "get-project-hierarchy") {
          return {
            ok: true,
            payload: { hierarchy: { customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: { activeViewId: "flow-nodes" } } }
          };
        }
        if (endpoint === "get-project-workspace-summary") {
          return { ok: true, payload: { summary: { flows: [], recordings: [], runtime: [], proposals: [] } } };
        }
        throw new Error("Unexpected endpoint " + endpoint);
      })
    };
    const cache = new AutomationStudioProjectDataAccess();
    cache.open("project.one");
    const controller = new AbortController();
    const hydration = await loadAutomationProjectHydration(api as any, cache, "project.one", controller.signal);

    expect(hydration.hierarchy.customHierarchyNodes).toEqual([]);
    expect(hydration.summary).toMatchObject({ flows: [] });
    expect(api.post.mock.calls.map((call) => call[0])).toEqual([
      "get-project-hierarchy",
      "get-project-workspace-summary"
    ]);
    expect(api.post.mock.calls.every((call) => call[2]?.signal instanceof AbortSignal)).toBe(true);
  });

  it("loads catalog categories, projects, and terminal status atomically", async () => {
    const store = createAutomationProjectCatalogStore<any, any>();
    const api = {
      get: vi.fn().mockResolvedValue({
        ok: true,
        payload: { categories: [{ id: "category.one" }], projects: [{ id: "project.one" }] }
      })
    };
    await loadAutomationProjectCatalog(api as any, store);
    expect(store.getState()).toMatchObject({
      loaded: true,
      loading: false,
      error: null,
      categories: [{ id: "category.one" }],
      projects: [{ id: "project.one" }]
    });
  });

  it("owns every catalog mutation endpoint outside the live root", async () => {
    const api = { post: vi.fn().mockResolvedValue({ ok: true, payload: {} }) };
    await createAutomationProject(api as any, { name: "One", description: "", categoryId: null, authorizationPin: "1234" });
    await renameAutomationProject(api as any, { projectId: "one", name: "Two", description: "Next", authorizationPin: "1234" });
    await moveAutomationProject(api as any, { projectId: "one", categoryId: "category.one", authorizationPin: "1234" });
    await deleteAutomationProject(api as any, { projectId: "one", authorizationPin: "1234" });
    await createAutomationProjectCategory(api as any, { name: "Group", authorizationPin: "1234" });
    await renameAutomationProjectCategory(api as any, { categoryId: "category.one", name: "Renamed", authorizationPin: "1234" });
    await deleteAutomationProjectCategory(api as any, { categoryId: "category.one", authorizationPin: "1234" });
    await reorderAutomationProjectCategories(api as any, { categoryIds: ["category.one"], authorizationPin: "1234" });

    expect(api.post.mock.calls.map((call) => call[0])).toEqual([
      "create-project",
      "update-project",
      "update-project",
      "delete-project",
      "create-project-category",
      "update-project-category",
      "delete-project-category",
      "reorder-project-categories"
    ]);
  });

  it("keeps modal typing and project API requests outside AutomationStudioLive", () => {
    const root = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    const gate = readFileSync(new URL("../live/AutomationStudioProjectGate.tsx", import.meta.url), "utf8");
    const runtime = readFileSync(new URL("../live/useAutomationProjectRuntime.ts", import.meta.url), "utf8");
    const surface = readFileSync(new URL("./ProjectCatalogSurface.tsx", import.meta.url), "utf8");

    expect(gate).toContain("AutomationProjectCatalogSurface");
    expect(runtime).toContain("useAutomationProjectLifecycle");
    expect(root).not.toContain("useProjectController(");
    expect(root).not.toContain("projectActionBusy");
    expect(root).not.toContain('"create-project"');
    expect(root).not.toContain('"update-project"');
    expect(root).not.toContain('"get-project-hierarchy"');
    expect(surface).toContain('selectProjectModalUi, "project-ui"');
    expect(surface).toContain("projectName: state.projectName");
  });
});
