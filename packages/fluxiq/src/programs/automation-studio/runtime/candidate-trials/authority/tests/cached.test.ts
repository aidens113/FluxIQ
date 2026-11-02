import { describe, expect, it, vi } from "vitest";
import { createExecutionAdmissionAuthority } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioFlowCandidateTrialGate } from "../../../flow-bootstrap/candidate/index.ts";
import { automationStudioCandidateTrialPort } from "../../../service/candidate-trial/index.ts";
import { trialFixture, SPENT_TWO } from "../../../service/candidate-trial/tests/fixtures.ts";
import { AutomationStudioCandidateTrialSource, candidateTrialModeOwner } from "../index.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import { candidateTrialReentry } from "../../reentry/index.ts";

async function cached() {
  const fixture = trialFixture();
  let actions = 0;
  let starts = 0;
  let resets = 0;
  let choices = 0;
  fixture.ports.graphOptions = ({ signal }) => ({ signal, nativeNodeExecutor: async () => {
    actions += 1;
    return { result: { status: "success", route: "success", outputs: {} } };
  } });
  const prepareStart = async () => {
    starts += 1;
    return {};
  };
  fixture.ports.prepareStart = prepareStart;
  const persistence = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence, scopes });
  const scope = await assembly.openScope(scopes.issue("cached.actual"));
  const callbacks = new ExecutionObservationSource(scope, "cached.actual.callbacks");
  callbacks.manage({ receiver: undefined, callback: prepareStart, contract: "no_direct_effects" });
  const source = new AutomationStudioCandidateTrialSource({ scope, consumer: assembly.consumer, seriesKey: "cached.actual.trials", callbacks });
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  source.connect(assembly.registerSource(source.registration([callbacks.owner])));
  bindTrialExecutionSource(fixture.ports, source);
  const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
  const input: ConstructorParameters<typeof AutomationStudioFlowCandidateTrialGate>[0] = { latest: () => fixture.candidate, trial: { candidateId: "candidate.1", port: trials.port } };
  const gate = new AutomationStudioFlowCandidateTrialGate(input);
  const loop = {};
  gate.bindReentry(loop);
  fixture.setVerdict({ verdict: "not_judged", why: "controlled judge unavailable", spent: { ...SPENT_TWO } });
  await gate.test({});
  Object.assign(trials.port, { offlineFirst: async () => {
    choices += 1;
    throw new Error("a pinned cached judgment must not call the public live-fallback choice");
  } });
  input.reset = { beforeTrial: async () => {
    resets += 1;
    return { kind: "admit" };
  }, trialRan: () => [] };
  return { fixture, trials, persistence, assembly, scope, gate, loop, counts: () => ({ actions, starts, resets }), choices: () => choices };
}

describe("a pinned cached judgment with pending live history", () => {
  it("runs the original retained judgment with no committing reservation, action, start, reset or promotion", async () => {
    const actual = await cached();
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    const before = actual.persistence.events.length;
    expect(candidateTrialReentry(actual.loop)?.claim(actual.gate.tool, {})).toBe(true);
    actual.fixture.setVerdict({ verdict: "yes", spent: { ...SPENT_TWO } });
    const answer = await actual.gate.test({});
    expect(answer).toMatchObject({ evidence: { ok: false, verdict: "yes" }, resultCode: "candidate.trial_cached_unverified" });
    expect(actual.gate.completion(actual.fixture.candidate).ok).toBe(false);
    expect(actual.counts()).toEqual({ actions: 1, starts: 1, resets: 0 });
    expect(actual.choices()).toBe(0);
    expect(actual.trials.records().map(record => record.trialRunId)).toEqual(["trial.1", "trial.1"]);
    expect(actual.fixture.judged[1]).toEqual(actual.fixture.judged[0]);
    expect(actual.persistence.events.slice(before).every(event => event === "inspect")).toBe(true);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
  });

  it("refuses an actually evicted checkout without re-running the Flow or preparing its start", async () => {
    const actual = await cached();
    expect(candidateTrialReentry(actual.loop)?.claim(actual.gate.tool, {})).toBe(true);
    const owner = candidateTrialModeOwner(actual.trials.port)!;
    const original = owner.readOnlyCall.bind(owner);
    vi.spyOn(owner, "readOnlyCall").mockImplementation((checkout, port, receiver, request) => {
      owner.release(checkout);
      return original(checkout, port, receiver, request);
    });
    await expect(actual.gate.test({})).rejects.toThrow();
    expect(actual.counts()).toEqual({ actions: 1, starts: 1, resets: 0 });
    expect(actual.choices()).toBe(0);
    expect(actual.fixture.judged).toHaveLength(1);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
  });
});
