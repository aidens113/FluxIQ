// A run's executor options take their clock, waits and randomness from the
// run's environment (traces and offline trials, P1, U7), and nothing else
// about them changes; absent, the live environment's, minus the `random` a
// live run never had (the Wait node reads a missing one as no jitter).
import { describe, expect, it } from "vitest";
import { AutomationStudioVirtualClock, automationStudioLiveRunEnvironment, createAutomationStudioScopedRunEnvironment } from "../../../environment/index.ts";
import { automationStudioRunGraphOptions } from "../graph-options.ts";

const base = () => {
  const signal = new AbortController().signal;
  const onRecordBatch = async () => {
    throw new Error("graph_options_test.record_batch_not_expected");
  };
  return { inputs: { query: "lamps" }, signal, authorizedDomainIds: ["example"], maxSteps: 12, onRecordBatch };
};

describe("a run's executor options and its environment", () => {
  it("take an offline environment's clock, waits and randomness", async () => {
    const clock = new AutomationStudioVirtualClock(5_000);
    const random = () => 0.25;
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock, random });
    const options = automationStudioRunGraphOptions({ ...base(), environment });

    expect(options.now).toBe(environment.now);
    expect(options.delay).toBe(environment.delay);
    expect(options.random).toBe(random);
    const startedAt = Date.now();
    await options.delay!(60_000);
    expect(options.now!()).toBe(65_000);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("take the live environment's clock and wait when none is given, and leave randomness unset", () => {
    const options = automationStudioRunGraphOptions(base());

    expect(options.now).toBe(automationStudioLiveRunEnvironment.now);
    expect(options.delay).toBe(automationStudioLiveRunEnvironment.delay);
    expect("random" in options).toBe(false);
    const explicit = automationStudioRunGraphOptions({ ...base(), environment: automationStudioLiveRunEnvironment });
    expect("random" in explicit).toBe(false);
    expect(explicit.now).toBe(automationStudioLiveRunEnvironment.now);
  });

  it("leave every other option as it was", () => {
    const input = base();
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock() });
    const withEnvironment = automationStudioRunGraphOptions({ ...input, environment });
    const without = automationStudioRunGraphOptions(input);
    const rest = ({ now: _now, delay: _delay, random: _random, ...others }: Record<string, unknown>) => others;

    expect(rest(withEnvironment)).toEqual(rest(without));
    expect(rest(without)).toEqual({ inputs: { query: "lamps" }, signal: input.signal, maxSteps: 12, onRecordBatch: input.onRecordBatch });
  });
});
