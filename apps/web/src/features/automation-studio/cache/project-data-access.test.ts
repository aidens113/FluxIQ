import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDataAccess } from "./project-data-access";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("AutomationStudioProjectDataAccess", () => {
  it("deduplicates concurrent reads for one project resource", async () => {
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.a");
    const pending = deferred<{ id: string }>();
    const load = vi.fn(() => pending.promise);
    const request = { projectId: "project.a", scope: "flow" as const, resourceId: "flow.1", load };

    const first = data.readThrough(request);
    const second = data.readThrough(request);
    expect(load).toHaveBeenCalledOnce();
    pending.resolve({ id: "flow.1" });
    await expect(first).resolves.toEqual({ id: "flow.1" });
    await expect(second).resolves.toEqual({ id: "flow.1" });
  });

  it("aborts old project work and rejects its stale result", async () => {
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.a");
    const pending = deferred<{ id: string }>();
    let signal: AbortSignal | undefined;
    const stale = data.readThrough({
      projectId: "project.a",
      scope: "flow",
      resourceId: "flow.1",
      load: (nextSignal) => { signal = nextSignal; return pending.promise; }
    });

    data.open("project.b");
    expect(signal?.aborted).toBe(true);
    pending.resolve({ id: "stale" });
    await expect(stale).resolves.toBeUndefined();
    await expect(data.readThrough({
      projectId: "project.a",
      scope: "flow",
      resourceId: "flow.1",
      load: vi.fn()
    })).resolves.toBeUndefined();
  });

  it("rejects a background result when a mutation wins the race", async () => {
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.a");
    const pending = deferred<{ revision: number }>();
    const read = data.readThrough({
      projectId: "project.a",
      scope: "recording",
      resourceId: "recording.1",
      load: () => pending.promise
    });
    data.invalidate("project.a", ["recording"], ["recording.1"]);
    pending.resolve({ revision: 1 });
    await expect(read).resolves.toBeUndefined();
  });

  it("keeps invalidation and remembered values project scoped", async () => {
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.a");
    expect(data.remember("project.b", "flow", "flow.1", { project: "b" })).toBeUndefined();
    data.remember("project.a", "flow", "flow.1", { project: "a" });
    const load = vi.fn();
    await expect(data.readThrough({ projectId: "project.a", scope: "flow", resourceId: "flow.1", load })).resolves.toEqual({ project: "a" });
    expect(load).not.toHaveBeenCalled();
  });
});