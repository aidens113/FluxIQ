import { describe, expect, it } from "vitest";
import type { ClientGatewayService } from "../../../../../../client-gateway/index.ts";
import { AutomationStudioHostLeaseScope } from "../../../../../../runtime/project-agents/host-resources/index.ts";
import { FluxNodeHostPool } from "../host-pool.ts";

function fixture() {
  const held = new Set<string>();
  let releases = 0;
  const gateway = { snapshot: () => ({ sessions: [{ sessionId: "session", managedHostId: "one", status: "ready", metadata: { domainId: "web" } }] }),
    onEvent: () => () => undefined,
    managedHosts: { bindRun: ({ runId }: { runId: string }) => {
      held.add(runId);
      return () => {
        held.delete(runId);
        releases++;
      };
    } }
  } as unknown as ClientGatewayService;
  const pool = new FluxNodeHostPool({ gateway, domainId: "web", capacity: 1 });
  return { pool, held, released: () => releases };
}

describe("FluxNode browser leases", () => {
  it("cancels a queued leaf without taking a lease and releases a throwing leaf", async () => {
    const f = fixture();
    let finish = (): void => undefined;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const first = f.pool.run("one", "project", new AbortController().signal, async () => {
      expect(AutomationStudioHostLeaseScope.current()?.sessionId).toBe("session");
      await gate;
    });
    await Promise.resolve();
    const stop = new AbortController();
    const queued = f.pool.run("two", "project", stop.signal, async () => { throw new Error("must not start"); });
    stop.abort(new Error("fixture stopped"));
    await expect(queued).rejects.toThrow("fixture stopped");
    finish();
    await first;
    await expect(f.pool.run("three", "project", new AbortController().signal, async () => { throw new Error("fixture task error"); })).rejects.toThrow("fixture task error");
    expect(f.held.size).toBe(0);
    expect(f.released()).toBe(2);
    await f.pool.close();
  });

  it("a one-host pipeline controller acquires only for each child; nested ownership is refused immediately", async () => {
    const f = fixture();
    for (const run of ["child-one", "child-two"]) await f.pool.run(run, "project", new AbortController().signal, async () => {
      expect(f.held.size).toBe(1);
      expect(() => f.pool.run("nested", "project", new AbortController().signal, async () => undefined)).toThrow("nested_lease");
    });
    expect(f.released()).toBe(2);
    await f.pool.close();
    await expect(f.pool.run("late", "project", new AbortController().signal, async () => undefined)).rejects.toThrow("pool is closing");
  });
});
