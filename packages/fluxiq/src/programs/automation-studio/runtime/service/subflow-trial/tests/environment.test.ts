// A partial trial runs in its environment (traces and offline trials, U7), as
// a whole candidate's trial does: live by default, exactly as before; under a
// scoped environment its clock, run id and client channel are the
// environment's, and it runs no start hook (Decision 6).
import { describe, expect, it } from "vitest";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { runAutomationStudioDetachedSubflow } from "../../../flow-bootstrap/verification/index.ts";
import { automationStudioSubflowTrialPort, runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture } from "./fixtures.ts";

function fixtureEnvironment(startAt = 7_000) {
  return createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(startAt), newRunId: (prefix) => `${prefix}.fixture-1`, random: () => 0.75 });
}

/** The fixture recording the channel scope each piece of the trial's client work ran in, and the options the runner got. */
function watched() {
  const fixture = subflowTrialFixture();
  const scopes: Array<[string, string | undefined]> = [];
  const seen = (what: string) => {
    scopes.push([what, AutomationStudioChannelScope.current()]);
  };
  const given: { options?: AutomationStudioGraphExecutionOptions | undefined; built?: AutomationStudioGraphExecutionOptions | undefined } = {};
  const graphOptions = fixture.ports.graphOptions;
  fixture.ports.graphOptions = (input) => {
    const built = graphOptions(input);
    given.built = built;
    return built;
  };
  fixture.ports.execute = async (input) => {
    seen("runner");
    given.options = input.options;
    return await runAutomationStudioDetachedSubflow(input);
  };
  fixture.ports.recordSets = async () => {
    seen("rows");
    return [];
  };
  fixture.ports.readEndView = async () => {
    seen("end view");
    return { view: { page: "done" } };
  };
  return { fixture, scopes, given };
}

describe("a partial trial's environment", () => {
  it("is live by default: today's run id shape, the options exactly as built, and no channel scope", async () => {
    const { fixture, scopes, given } = watched();
    delete fixture.ports.newRunId;
    const { result, record } = await runAutomationStudioSubflowTrial(fixture.request(), fixture.ports);
    expect(record.execution).toBe("succeeded");
    expect(result.trialRunId).toMatch(/^subflow-trial\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(given.options).toBe(given.built);
    expect(scopes.every(([, scope]) => scope === undefined)).toBe(true);
    expect(automationStudioSubflowTrialPort("build.1", fixture.ports).port.environmentKind).toBe("live");
  });

  it("takes the clock, run id and channel from a fixture environment, and runs its client work inside it", async () => {
    const { fixture, scopes, given } = watched();
    delete fixture.ports.now;
    delete fixture.ports.newRunId;
    const environment = fixtureEnvironment(7_000);
    fixture.ports.environment = environment;
    const { result, record } = await runAutomationStudioSubflowTrial(fixture.request(), fixture.ports);
    expect(record.execution).toBe("succeeded");
    expect(result.trialRunId).toBe("subflow-trial.fixture-1");
    expect(fixture.sessions.find((session) => session.status === "running")?.startedAt).toBe(7_000);
    expect(given.options?.now).toBe(environment.now);
    expect(given.options?.delay).toBe(environment.delay);
    expect(given.options?.random).toBe(environment.random);
    expect(scopes.map(([what]) => what)).toEqual(expect.arrayContaining(["runner", "rows", "end view"]));
    expect(scopes.every(([, scope]) => scope === environment.scopeId)).toBe(true);
  });

  it("runs no start hook for an offline trial, and its port offers none and says its kind", async () => {
    const { fixture } = watched();
    let hooks = 0;
    const environment = fixtureEnvironment();
    const { port, records } = automationStudioSubflowTrialPort("build.1", { ...fixture.ports, environment, prepareStart: async () => {
      hooks += 1;
      return { reset: true };
    } });
    expect(port.environmentKind).toBe("fixture");
    expect(port.prepareStart).toBeUndefined();
    await port(fixture.request());
    expect(records()[0]).toMatchObject({ start: { status: "not_reset" }, execution: "succeeded" });
    expect(hooks).toBe(0);
  });
});
