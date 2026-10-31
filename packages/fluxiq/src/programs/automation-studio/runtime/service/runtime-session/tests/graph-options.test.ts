// A run's executor options take their clock, waits, randomness and region
// timeout timer from the run's environment (traces and offline trials, P1 U7,
// P4 "Virtual clock"), and nothing else about them changes; absent, the live
// environment's, minus the `random` and the `startTimer` a live run never had
// (the Wait node reads a missing `random` as no jitter, and a missing
// `startTimer` leaves the region timeout on the executor's real timer).
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
  it("keeps the session's reference beside an independently advancing live environment clock", async () => {
    const referenceNow = Date.UTC(2026, 9, 30, 23, 59, 59);
    const clock = new AutomationStudioVirtualClock(referenceNow);
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
    const options = automationStudioRunGraphOptions({ ...base(), referenceNow, environment });
    await options.delay!(2_000);
    expect(options.referenceNow).toBe(referenceNow);
    expect(options.now!()).toBe(referenceNow + 2_000);
    expect(automationStudioRunGraphOptions({ ...base(), referenceNow: NaN, environment })).not.toHaveProperty("referenceNow");
  });

  it("take an offline environment's clock, waits, randomness and region timer", async () => {
    const clock = new AutomationStudioVirtualClock(5_000);
    const random = () => 0.25;
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock, random });
    const options = automationStudioRunGraphOptions({ ...base(), environment });

    expect(options.now).toBe(environment.now);
    expect(options.delay).toBe(environment.delay);
    expect(options.random).toBe(random);
    expect(options.startTimer).toBe(environment.startTimer);
    const startedAt = Date.now();
    await options.delay!(60_000);
    expect(options.now!()).toBe(65_000);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("take the live environment's clock and wait when none is given, and leave randomness and the region timer unset", () => {
    const options = automationStudioRunGraphOptions(base());

    expect(options.now).toBe(automationStudioLiveRunEnvironment.now);
    expect(options.delay).toBe(automationStudioLiveRunEnvironment.delay);
    expect("random" in options).toBe(false);
    expect("startTimer" in options).toBe(false);
    const explicit = automationStudioRunGraphOptions({ ...base(), environment: automationStudioLiveRunEnvironment });
    expect("random" in explicit).toBe(false);
    expect("startTimer" in explicit).toBe(false);
    expect(explicit.now).toBe(automationStudioLiveRunEnvironment.now);
  });

  it("leave every other option as it was", () => {
    const input = base();
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock() });
    const withEnvironment = automationStudioRunGraphOptions({ ...input, environment });
    const without = automationStudioRunGraphOptions(input);
    const rest = ({ now: _now, delay: _delay, random: _random, startTimer: _startTimer, ...others }: Record<string, unknown>) => others;

    expect(rest(withEnvironment)).toEqual(rest(without));
    expect(rest(without)).toEqual({ inputs: { query: "lamps" }, signal: input.signal, maxSteps: 12, onRecordBatch: input.onRecordBatch });
  });
});
