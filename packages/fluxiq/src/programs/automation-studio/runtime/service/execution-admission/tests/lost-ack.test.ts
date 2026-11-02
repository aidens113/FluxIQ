// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { AutomationStudioCommandExecutionController } from "../../command-execution/index.ts";
import { AutomationStudioExecutionAdmissionController } from "../controller.ts";
import { observedGatewayFixture } from "./fixture.ts";
import { IsolatedScopeResource } from "./resource-owner.ts";

it("retains a real lost-ACK command across complete-attestation controller reopen without another send", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "scope-ack-owned-"));
  const resource = await IsolatedScopeResource.open(root);
  try {
    await observedGatewayFixture(async h => {
      expect(h.continuation.binding.resourceKeys).toEqual([resource.resourceKey]);
      h.acknowledge(false);
      const context = await h.bind();
      const abort = new AbortController();
      const response = h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.actual-owned-resource-act" }, { context, signal: abort.signal });
      await vi.waitFor(() => expect(h.sends).toHaveLength(1));
      abort.abort();
      expect(await response.result).toEqual({ status: "outcome_unknown" });
      await h.continuation.assembly.consumer.release(h.reserved.reservation);
      await h.controller.close();
      const required = new AutomationStudioCommandExecutionController({ pool: h.pool, getRuntimeSession: async () => null });
      const controller = new AutomationStudioExecutionAdmissionController({ pool: h.pool, requiredOwner: required, getRuntimeSession: async () => null, scopeAttestor: resource });
      try {
        const continuation = await controller.open({ projectId: h.projectId, flowId: h.flowId });
        expect(continuation.binding).toEqual(h.continuation.binding);
        expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("pending");
        const source = new AdmissionTestSource(continuation.scope, "fixture.after-lost-ack");
        const ports = continuation.assembly.registerSource(source);
        const origin = source.origin();
        await expect(continuation.assembly.consumer.reserve(continuation.scope, ports.issuer.fromOrdinaryAdmission(source.admit(origin)))).rejects.toThrow("execution_blocked");
        expect(h.sends).toHaveLength(1);
      } finally {
        await controller.close();
        await required.close();
      }
    }, resource);
  } finally {
    await resource.close();
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("scope-ack-owned-")) throw new Error("Refusing cleanup outside owned scope fixture.");
    await rm(resolved, { recursive: true, force: true });
  }
});
