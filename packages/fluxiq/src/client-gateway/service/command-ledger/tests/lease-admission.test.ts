import { describe, expect, it } from "vitest";
import { leaseAdmissionFixture } from "./lease-admission-fixture.ts";

describe("durable lease admission across storage and reentrant preparation", () => {
  it.each(["resolve", "claim"] as const)("release during paused %s refuses known-unsent without receipt or uncertainty", async (pause) => {
    const f = await leaseAdmissionFixture({ pause });
    try {
      const response = await f.scope.run({ role: "builder", briefId: "old" }, async () => { const response = f.dispatch();
        await f.entered;
        return response; });
      f.proceed();
      expect(await response.result).toMatchObject({ status: "refused_unsent", refusal: { code: "host_lease.stale" } });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).filter((item) => item.type === "server.execute_action")).toEqual([]);
      expect(f.ledger.commitReceipt).not.toHaveBeenCalled();
      expect(f.ledger.markUnknown).not.toHaveBeenCalled();
      expect(f.observer.uncertain).not.toHaveBeenCalled();
      if (pause === "resolve") { expect(f.ledger.claim).not.toHaveBeenCalled();
        expect(f.saved()).toBeNull(); }
      else { expect(f.saved()).toMatchObject({ state: "refused_unsent", receipt: null, unknownReason: null }); }
    } finally { await f.close(); }
  });

  it.each(["trace", "timer"] as const)("rechecks a lease released by the %s callback before queue or socket invocation", async (where) => {
    let f!: Awaited<ReturnType<typeof leaseAdmissionFixture>>;
    const release = () => { const lease = f.binding.current()!;
      void f.scope.scheduler.release(lease); };
    f = await leaseAdmissionFixture(where === "trace" ? { traceHook: release } : { timerHook: release });
    try {
      const response = await f.scope.run({ role: "builder", briefId: "old" }, async () => {
        const response = f.dispatch();
        expect(await response.result).toMatchObject({ status: "refused_unsent", refusal: { code: "host_lease.stale" } });
        return response;
      });
      expect((await response.result).status).toBe("refused_unsent");
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((item) => item.type === "server.execute_action")).toBe(false);
      expect(f.ledger.markUnknown).not.toHaveBeenCalled();
      expect(f.observer.uncertain).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it.each(["trace", "timer"] as const)("Stop inside %s preparation stays cancelled-before-send and leaves no queued command", async (where) => {
    let f!: Awaited<ReturnType<typeof leaseAdmissionFixture>>;
    const stop = () => f.abort.abort(new Error("fixture Stop"));
    f = await leaseAdmissionFixture(where === "trace" ? { traceHook: stop } : { timerHook: stop });
    try {
      await f.scope.run({ role: "builder", briefId: "held" }, async () => {
        expect(await f.dispatch().result).toMatchObject({ status: "refused_unsent", refusal: { code: "cancelled_before_send" } });
      });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((item) => item.type === "server.execute_action")).toBe(false);
      expect(f.ledger.markUnknown).not.toHaveBeenCalled();
      expect(f.observer.uncertain).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it("a trace sink disconnect cannot leave a sendable outbound command", async () => {
    let f!: Awaited<ReturnType<typeof leaseAdmissionFixture>>;
    f = await leaseAdmissionFixture({ traceHook: () => { f.gateway.disconnect(f.sessionId, "synthetic disconnect"); } });
    try {
      expect(await f.dispatch().result).toMatchObject({ status: "refused_unsent", refusal: { code: "session_unavailable" } });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((item) => item.type === "server.execute_action")).toBe(false);
      expect(f.ledger.markUnknown).not.toHaveBeenCalled();
      expect(f.observer.uncertain).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it("metadata changed after pairing cannot change the trusted domain, and immediate replies still commit", async () => {
    const f = await leaseAdmissionFixture({ synchronousReply: true });
    f.metadata.domainId = "forged.domain";
    try {
      await f.scope.run({ role: "builder", briefId: "held" }, async () => {
        expect(await f.dispatch().result).toMatchObject({ status: "completed", result: { status: "succeeded" } });
      });
      expect(f.actions).toHaveLength(1);
      expect(f.actions[0]).toHaveProperty("lease");
      expect(f.ledger.commitReceipt).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });
});
