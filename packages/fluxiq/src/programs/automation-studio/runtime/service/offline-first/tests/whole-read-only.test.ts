import { afterEach, describe, expect, it } from "vitest";
import { createExecutionAdmissionAuthority } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioFlowCandidateTrialGate } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioCandidateTrialSource } from "../../../candidate-trials/authority/index.ts";
import { bindTrialExecutionSource, bindTrialOfflineRunnerContract, trialOfflineRunner } from "../../../candidate-trials/observation/index.ts";
import { automationStudioCandidateTrialPort } from "../../candidate-trial/index.ts";
import { candidateOf, offlineHarness, requestFor, type OfflineHarness } from "../../offline-trial/tests/offline-harness.ts";
import { automationStudioOfflineFirstWhole } from "../whole.ts";

let harness: OfflineHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function prepared(contract: boolean) {
  harness = await offlineHarness();
  const actual = harness;
  let starts = 0;
  let resets = 0;
  actual.ports.prepareStart = async () => {
    starts += 1;
    return {};
  };
  const persistence = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence, scopes });
  const scope = await assembly.openScope(scopes.issue("offline.actual"));
  const callbacks = new ExecutionObservationSource(scope, "offline.actual.callbacks");
  const source = new AutomationStudioCandidateTrialSource({ scope, consumer: assembly.consumer, seriesKey: "offline.actual.trials", callbacks });
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  source.connect(assembly.registerSource(source.registration([callbacks.owner])));
  bindTrialExecutionSource(actual.ports, source);
  const live = automationStudioCandidateTrialPort("candidate.offline", actual.ports);
  const offline = automationStudioOfflineFirstWhole({ candidateId: "candidate.offline", ports: actual.ports, phase: "test",
    installation: { gateway: actual.gateway, storeFor: () => actual.store, sessionViewFor: () => undefined } });
  const runner = trialOfflineRunner(actual.ports)!.runner;
  // This fixture owns every collaborator: its only command route is the actual scoped trace matcher.
  // Its execute callback delegates to the canonical runner; local dispatch and live transport are asserted below.
  if (contract) bindTrialOfflineRunnerContract(actual.ports, callbacks, { receiver: runner, callback: runner.run, contract: "no_direct_effects" });
  let candidate = candidateOf({ query: "lamps", threshold: 10 });
  const input: ConstructorParameters<typeof AutomationStudioFlowCandidateTrialGate>[0] = { latest: () => candidate, trial: { candidateId: "candidate.offline", port: live.port } };
  const gate = new AutomationStudioFlowCandidateTrialGate(input);
  await gate.test({});
  candidate = candidateOf({ query: "lamps", threshold: 15 }, 2);
  input.reset = { beforeTrial: async () => {
    resets += 1;
    return { kind: "admit" };
  }, trialRan: () => [] };
  return { actual, persistence, assembly, scope, source, callbacks, live, offline, runner, gate, candidate, counts: () => ({ starts, resets }) };
}

describe("raw offline diagnosis", () => {
  it("requires the original owner's explicit contract despite a genuine replay source", async () => {
    const actual = await prepared(false);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    await expect(actual.gate.test({})).rejects.toThrow();
    expect(actual.actual.live.commands()).toHaveLength(1);
    expect(actual.actual.localDispatches).toEqual([]);
    expect(actual.counts()).toEqual({ starts: 1, resets: 0 });
  });

  it("uses the pinned actual matcher without live reservation, reset, fallback or promotion", async () => {
    const actual = await prepared(true);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    const before = actual.persistence.events.length;
    const result = await actual.gate.test({});
    expect(result).toMatchObject({ evidence: { verdict: "yes", ok: false }, resultCode: "candidate.trial_offline_yes" });
    expect(actual.gate.completion(actual.candidate).ok).toBe(false);
    expect(actual.actual.live.commands()).toHaveLength(1);
    expect(actual.actual.localDispatches).toEqual([]);
    expect(actual.counts()).toEqual({ starts: 1, resets: 0 });
    expect(actual.persistence.events.slice(before).every(event => event === "inspect")).toBe(true);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    expect(actual.offline.offlineRecords()).toHaveLength(1);
    expect(actual.live.records()).toHaveLength(1);
  });

  it("rejects copied and spent original leases and a changed execution collaborator", async () => {
    const actual = await prepared(true);
    const lease = actual.runner.pin("candidate.offline", actual.candidate)!;
    expect(actual.runner.current({ ...lease }, "candidate.offline", actual.candidate)).toBe(false);
    await expect(actual.runner.run({ ...lease }, requestFor(actual.candidate))).rejects.toThrow("lease_lost");
    await actual.callbacks.invokeReadOnly({ receiver: actual.runner, callback: actual.runner.run, args: [lease, requestFor(actual.candidate)] });
    expect(actual.runner.current(lease, "candidate.offline", actual.candidate)).toBe(false);
    await expect(actual.runner.run(lease, requestFor(actual.candidate))).rejects.toThrow("lease_lost");
    const original = actual.actual.ports.graphOptions;
    actual.actual.ports.graphOptions = request => original(request);
    await expect(actual.gate.test({})).rejects.toThrow();
    expect(actual.actual.live.commands()).toHaveLength(1);
    expect(actual.actual.localDispatches).toEqual([]);
    expect(actual.counts()).toEqual({ starts: 1, resets: 0 });
  });
});
