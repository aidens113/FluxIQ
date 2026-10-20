// A candidate trial runs in its environment (traces and offline trials, U7):
// live by default, exactly as before; under a scoped environment its clock,
// run id and client channel are the environment's, and it runs no start hook
// (Decision 6). In its own directory because `../../` is at its file limit.
import { describe, expect, it } from "vitest";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, automationStudioLiveRunEnvironment, createAutomationStudioScopedRunEnvironment } from "../../../../../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../../executor/index.ts";
import { runAutomationStudioDetachedCandidate } from "../../../../../flow-bootstrap/verification/index.ts";
import { automationStudioCandidateTrialPort, automationStudioCandidateTrialStart, runAutomationStudioCandidateTrial } from "../../../index.ts";
import { trialFixture } from "../../fixtures.ts";

/** An offline environment on a virtual clock at `startAt`, with a fixed run id and randomness. */
function fixtureEnvironment(startAt = 5_000) {
  return createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(startAt), newRunId: (prefix) => `${prefix}.fixture-1`, random: () => 0.25 });
}

/** The fixture with a succeeding press, recording the channel scope each piece of the trial's client work ran in and the options the runner got. */
function watched() {
  const fixture = trialFixture();
  const scopes: Array<[string, string | undefined]> = [];
  const seen = (what: string) => {
    scopes.push([what, AutomationStudioChannelScope.current()]);
  };
  const given: { options?: AutomationStudioGraphExecutionOptions | undefined; built?: AutomationStudioGraphExecutionOptions | undefined } = {};
  fixture.ports.graphOptions = ({ signal }) => {
    const built: AutomationStudioGraphExecutionOptions = {
      signal,
      now: () => 100,
      nativeNodeExecutor: async () => {
        seen("press");
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    };
    given.built = built;
    return built;
  };
  fixture.ports.execute = async (input) => {
    seen("runner");
    given.options = input.options;
    return await runAutomationStudioDetachedCandidate(input);
  };
  fixture.ports.recordSets = async () => {
    seen("rows");
    return [];
  };
  fixture.ports.readEndView = async () => {
    seen("end view");
    return { view: { page: "done" } };
  };
  fixture.ports.actionAttempts = () => {
    seen("attempts");
    return [];
  };
  fixture.ports.deniedEvidenceKeys = [];
  return { fixture, scopes, given };
}

describe("a candidate trial's environment", () => {
  it("is live by default: today's run id shape, the options exactly as built, and no channel scope", async () => {
    const { fixture, scopes, given } = watched();
    delete fixture.ports.newRunId;
    const { result, record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(record.execution).toBe("succeeded");
    expect(result.trialRunId).toMatch(/^trial\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(given.options).toBe(given.built);
    expect(given.options?.random).toBeUndefined();
    expect(scopes.length).toBeGreaterThanOrEqual(4);
    expect(scopes.every(([, scope]) => scope === undefined)).toBe(true);
    expect(automationStudioCandidateTrialPort("candidate.1", fixture.ports).port.environmentKind).toBe("live");
  });

  it("takes the clock and run id from a fixture environment when the ports name neither", async () => {
    const { fixture, given } = watched();
    delete fixture.ports.now;
    delete fixture.ports.newRunId;
    const environment = fixtureEnvironment(5_000);
    fixture.ports.environment = environment;
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result.trialRunId).toBe("trial.fixture-1");
    expect(fixture.sessions.find((session) => session.status === "running")?.startedAt).toBe(5_000);
    expect(given.options?.now).toBe(environment.now);
    expect(given.options?.delay).toBe(environment.delay);
    expect(given.options?.random).toBe(environment.random);
    expect(given.options?.nativeNodeExecutor).toBe(given.built?.nativeNodeExecutor);
  });

  it("keeps a live environment's randomness unset, as a normal run leaves it", async () => {
    const { fixture, given } = watched();
    fixture.ports.environment = automationStudioLiveRunEnvironment;
    await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(given.options?.random).toBeUndefined();
    expect(given.options?.now).toBe(automationStudioLiveRunEnvironment.now);
  });

  it("runs the trial's client work inside the environment's channel scope", async () => {
    const { fixture, scopes } = watched();
    const environment = fixtureEnvironment();
    fixture.ports.environment = environment;
    const { record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(record.execution).toBe("succeeded");
    expect(scopes.map(([what]) => what)).toEqual(expect.arrayContaining(["runner", "press", "rows", "end view", "attempts"]));
    expect(scopes.every(([, scope]) => scope === environment.scopeId)).toBe(true);
    expect(AutomationStudioChannelScope.current()).toBeUndefined();
  });

  it("runs no start hook for an offline trial, and its port offers none and says its kind", async () => {
    const { fixture } = watched();
    let hooks = 0;
    fixture.ports.prepareStart = async () => {
      hooks += 1;
      return { put: "back" };
    };
    fixture.ports.environment = fixtureEnvironment();
    const signal = new AbortController().signal;
    expect(await automationStudioCandidateTrialStart({ candidateId: "candidate.1", revision: 1, digest: fixture.candidate.digest, signal }, fixture.ports)).toEqual({ status: "not_reset" });
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    expect(trials.port.environmentKind).toBe("fixture");
    expect(trials.port.prepareStart).toBeUndefined();
    await trials.port(fixture.request(signal));
    expect(trials.records()[0]).toMatchObject({ start: { status: "not_reset" }, execution: "succeeded" });
    expect(hooks).toBe(0);
    // A live environment named outright keeps the hook, as before.
    fixture.ports.environment = automationStudioLiveRunEnvironment;
    const live = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    expect(live.port.environmentKind).toBe("live");
    expect(await live.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("reset");
    expect(hooks).toBe(1);
  });
});
