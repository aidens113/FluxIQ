import { describe, expect, it, vi } from "vitest";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { partialAdmissionFixture } from "../../../candidate-trials/partial/tests/fixture.ts";
import { bindTrialExecutionSource } from "../../../candidate-trials/observation/index.ts";
import { candidateOf, offlineHarness, requestFor } from "../../offline-trial/tests/offline-harness.ts";
import { SCOPE, subflowHarness, subflowOf, subflowRequestFor } from "../../offline-trial/tests/subflow-harness.ts";
import { automationStudioOfflineFirstSubflow, automationStudioOfflineFirstWhole } from "../index.ts";

describe("the original offline-disabled decision", () => {
  it("touches no injected collaborator or admission history while the actual live continuation is pending", async () => {
    let sends = 0;
    const persistence = new AdmissionTestPersistence();
    const f = await partialAdmissionFixture({ persistence, port: async () => {
      sends += 1;
      throw new Error("the actual isolated first send acknowledgement was lost");
    } });
    await f.gate.test(f.receipt());
    expect(sends).toBe(1);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
    const harness = await offlineHarness();
    try {
      const collaborator = vi.fn(() => { throw new Error("disabled choice touched an injected collaborator"); });
      const wholePorts = new Proxy(harness.ports, { get: collaborator });
      const partialPorts = new Proxy(subflowHarness(harness).ports, { get: collaborator });
      bindTrialExecutionSource(wholePorts, f.configured);
      bindTrialExecutionSource(partialPorts, f.configured);
      const whole = automationStudioOfflineFirstWhole({ candidateId: "candidate.offline", ports: wholePorts, installation: undefined, phase: "test", liveRecords: collaborator });
      const partial = automationStudioOfflineFirstSubflow({ buildId: SCOPE.buildId, ports: partialPorts, installation: undefined, phase: "test", liveRecords: collaborator });
      const wholeRequest = requestFor(candidateOf({ query: "lamps", threshold: 10 }));
      const partialRequest = subflowRequestFor(subflowOf({ queries: ["lamps"], threshold: 10 }));
      const history = JSON.stringify(persistence.events);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(await whole.offlineFirst(wholeRequest)).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
        expect(await partial.offlineFirst(partialRequest)).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
      }
      const stop = new AbortController();
      const cancelled = new Error("isolated disabled decision cancelled");
      stop.abort(cancelled);
      await expect(whole.offlineFirst({ ...wholeRequest, signal: stop.signal })).rejects.toBe(cancelled);
      await expect(partial.offlineFirst({ ...partialRequest, signal: stop.signal })).rejects.toBe(cancelled);
      expect(collaborator).not.toHaveBeenCalled();
      expect(JSON.stringify(persistence.events)).toBe(history);
      expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
      expect(sends).toBe(1);
      expect(harness.traces()).toBe(0);
      expect(harness.live.commands()).toEqual([]);
      expect(harness.judged).toEqual([]);
    } finally { await harness.close(); }
  });

  it("does not grant the installed live-or-cache callback the literal decision's contract", async () => {
    let sends = 0;
    const f = await partialAdmissionFixture({ port: async () => {
      sends += 1;
      throw new Error("the original isolated send is unresolved");
    } });
    await f.gate.test(f.receipt());
    const harness = await offlineHarness();
    try {
      const liveRecords = vi.fn(() => { throw new Error("an installed callback must not run past pending admission"); });
      const ports = subflowHarness(harness).ports;
      bindTrialExecutionSource(ports, f.configured);
      const offline = automationStudioOfflineFirstSubflow({ buildId: SCOPE.buildId, ports, phase: "test", liveRecords,
        installation: { gateway: harness.gateway, storeFor: () => harness.store, sessionViewFor: () => undefined } });
      await expect(offline.offlineFirst(subflowRequestFor(subflowOf({ queries: ["lamps"], threshold: 10 })))).rejects.toThrow("store.blocked");
      expect(liveRecords).not.toHaveBeenCalled();
      expect(sends).toBe(1);
      expect(harness.live.commands()).toEqual([]);
      expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
    } finally { await harness.close(); }
  });
});
