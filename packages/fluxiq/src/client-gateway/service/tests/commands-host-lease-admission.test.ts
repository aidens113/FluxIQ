import { describe, expect, it } from "vitest";
import { leaseAdmissionFixture } from "../command-ledger/tests/lease-admission-fixture.ts";

describe("ordinary command final host lease admission", () => {
  it.each(["trace", "timer"] as const)("lease release in %s preparation refuses without queue or socket effects", async (where) => {
    let f!: Awaited<ReturnType<typeof leaseAdmissionFixture>>;
    const release = () => { void f.scope.scheduler.release(f.binding.current()!); };
    f = await leaseAdmissionFixture(where === "trace" ? { traceHook: release } : { timerHook: release });
    try {
      await f.scope.run({ role: "builder", briefId: "held" }, async () => {
        expect(await f.gateway.executeAction(f.sessionId, { actionType: "synthetic.act" }).result).toMatchObject({ status: "failed", failure: { code: "host_lease.stale", effect: "unacted" } });
      });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((message) => message.type === "server.execute_action")).toBe(false);
      expect(f.ledger.claim).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it.each(["trace", "timer"] as const)("disconnect in %s preparation never leaves a drainable command", async (where) => {
    let f!: Awaited<ReturnType<typeof leaseAdmissionFixture>>;
    const disconnect = () => { f.gateway.disconnect(f.sessionId, "synthetic disconnect"); };
    f = await leaseAdmissionFixture(where === "trace" ? { traceHook: disconnect } : { timerHook: disconnect });
    try {
      const result = await f.gateway.executeAction(f.sessionId, { actionType: "synthetic.act" }).result;
      expect(result).toMatchObject({ status: "failed", failure: { effect: "unacted" } });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((message) => message.type === "server.execute_action")).toBe(false);
    } finally { await f.close(); }
  });

  it("a throwing timer is a known preparation failure, with no executable queued command", async () => {
    const f = await leaseAdmissionFixture({ timerHook: () => { throw new Error("synthetic timer failure"); } });
    try {
      expect(await f.gateway.executeAction(f.sessionId, { actionType: "synthetic.act" }).result).toMatchObject({ status: "failed", failure: { code: "client_gateway.preparation_failed", effect: "unacted" } });
      expect(f.actions).toEqual([]);
      expect(f.gateway.outbound(f.sessionId).some((message) => message.type === "server.execute_action")).toBe(false);
    } finally { await f.close(); }
  });

  it("a timer firing during preparation never sends an already expired command", async () => {
    const f = await leaseAdmissionFixture({ timerHook: (fire) => fire() });
    try {
      expect(await f.gateway.executeAction(f.sessionId, { actionType: "synthetic.act" }).result).toMatchObject({ status: "failed", failure: { code: "client_gateway.timeout_before_send", effect: "unacted" } });
      expect(f.actions).toEqual([]);
    } finally { await f.close(); }
  });

  it("trusted binding survives changed hello metadata and immediate socket answers still settle", async () => {
    const f = await leaseAdmissionFixture({ synchronousReply: true });
    f.metadata.domainId = "forged.domain";
    try {
      await f.scope.run({ role: "builder", briefId: "held" }, async () => {
        expect((await f.gateway.executeAction(f.sessionId, { actionType: "synthetic.act" }).result).status).toBe("succeeded");
      });
      expect(f.actions).toHaveLength(1);
      expect(f.actions[0]).toHaveProperty("lease");
    } finally { await f.close(); }
  });
});
