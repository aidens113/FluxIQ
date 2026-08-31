import { describe, expect, it, vi } from "vitest";
import { createAutomationProjectCatalogStore } from "../stores";
import { loadAutomationProjectCatalog } from "./project-catalog-queries";
import { createAutomationProjectLifecycle, createAutomationProjectLifecycleLease } from "./project-lifecycle";

describe("Automation Studio project lifecycle", () => {
  it("recreates a disposed lifecycle for React Strict Mode effect remounting", async () => {
    const committed: string[] = [];
    let instances = 0;
    const lease = createAutomationProjectLifecycleLease(() => {
      instances += 1;
      return createAutomationProjectLifecycle({
        publishOpening: () => undefined,
        hydrate: async (projectId) => projectId,
        commit: (projectId) => committed.push(projectId),
        fail: () => undefined,
        clear: () => undefined
      });
    });

    lease.current();
    lease.dispose();
    await expect(lease.current().open("project.after-remount")).resolves.toBe(true);

    expect(instances).toBe(2);
    expect(committed).toEqual(["project.after-remount"]);
  });

  it("publishes the opening shell synchronously before hydration", async () => {
    let resolve!: (value: string) => void;
    const order: string[] = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: (id) => order.push("opening:" + id),
      hydrate: () => new Promise<string>((done) => { resolve = done; }),
      commit: (id) => order.push("commit:" + id),
      fail: () => order.push("fail"),
      clear: () => order.push("clear")
    });
    const opened = lifecycle.open("project.one");
    expect(order).toEqual(["opening:project.one"]);
    resolve("summary");
    await expect(opened).resolves.toBe(true);
    expect(order).toEqual(["opening:project.one", "commit:project.one"]);
  });

  it("aborts and ignores stale hydration during rapid project switching", async () => {
    const requests: Array<{ id: string; signal: AbortSignal; resolve(value: string): void }> = [];
    const committed: string[] = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: () => undefined,
      hydrate: (id, signal) => new Promise<string>((resolve) => requests.push({ id, signal, resolve })),
      commit: (id) => committed.push(id),
      fail: () => undefined,
      clear: () => undefined
    });
    const first = lifecycle.open("project.one");
    const second = lifecycle.open("project.two");
    expect(requests[0]?.signal.aborted).toBe(true);
    requests[0]?.resolve("stale");
    requests[1]?.resolve("current");
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(committed).toEqual(["project.two"]);
  });

  it("uses an injected session generation to reject work invalidated elsewhere", async () => {
    let generation = 0;
    let resolve!: (value: string) => void;
    const commits: string[] = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: () => undefined,
      hydrate: () => new Promise<string>((done) => { resolve = done; }),
      commit: (id) => commits.push(id),
      fail: () => undefined,
      clear: () => undefined
    }, {
      advance: () => ++generation,
      current: () => generation,
      isCurrent: (candidate) => candidate === generation
    });

    const opening = lifecycle.open("project.one");
    generation += 1;
    resolve("stale");

    await expect(opening).resolves.toBe(false);
    expect(commits).toEqual([]);
  });

  it("cancels project work before clearing on close", async () => {
    let signal: AbortSignal | undefined;
    const cleared: Array<string | null> = [];
    const lifecycle = createAutomationProjectLifecycle({
      publishOpening: () => undefined,
      hydrate: (_id, nextSignal) => { signal = nextSignal; return new Promise(() => undefined); },
      commit: () => undefined,
      fail: () => undefined,
      clear: (id) => cleared.push(id)
    });
    void lifecycle.open("project.one");
    lifecycle.close();
    expect(signal?.aborted).toBe(true);
    expect(cleared).toEqual(["project.one"]);
    expect(lifecycle.activeProjectId()).toBeNull();
  });

  it("loads catalog state through a cancel-aware query owner", async () => {
    const store = createAutomationProjectCatalogStore<any>();
    const api = { get: vi.fn().mockResolvedValue({ ok: true, payload: { categories: [], projects: [{ id: "project.one" }] } }) };
    await expect(loadAutomationProjectCatalog(api as any, store)).resolves.toMatchObject({ projects: [{ id: "project.one" }] });
    expect(store.getState()).toMatchObject({ loading: false, error: null, projects: [{ id: "project.one" }] });
    expect(api.get).toHaveBeenCalledWith("projects", {});
  });
});
