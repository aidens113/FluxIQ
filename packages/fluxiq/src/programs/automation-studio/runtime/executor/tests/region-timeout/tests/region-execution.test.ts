// The region timeout under an environment (traces and offline trials, P4,
// "Virtual clock"): an offline environment's executor options carry its
// virtual timers, so a region outlasting its timeout in virtual time times out
// by the production region path (`../../../region-execution.ts`) with no
// wall wait; the live environment's options carry none, so the region timeout
// stays the real `setTimeout`, as before.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../../index.ts";
import { executeWithRegionTimeout } from "../../../region-execution.ts";
import { automationStudioEnvironmentExecutorOptions, automationStudioLiveRunEnvironment, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../../../environment/index.ts";

function attempt(status: AutomationStudioNodeAttemptTrace["status"], message: string): AutomationStudioNodeAttemptTrace {
  return { attemptId: "step.attempt.1", nodeId: "step", definitionId: "builtin.policy.action", startedAt: 0, finishedAt: 0, status, route: status === "succeeded" ? "success" : "failed", inputs: {}, outputs: {}, effects: [], message };
}

function offline() {
  const clock = new AutomationStudioVirtualClock(0);
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
  const options = automationStudioEnvironmentExecutorOptions({ inputs: {} }, environment);
  return { clock, options };
}

describe("a region timeout under an environment", () => {
  it("offline: times the region out when its work outlasts the timeout in virtual time, with no wall wait", async () => {
    const { clock, options } = offline();
    let aborted = false;
    const started = Date.now();

    const result = await executeWithRegionTimeout(
      async (signal) => {
        signal.addEventListener("abort", () => { aborted = true; });
        await options.delay!(3_600_000);
        return attempt("succeeded", "finished too late");
      },
      60_000,
      undefined,
      () => attempt("failed", "region timed out"),
      undefined,
      options.startTimer
    );

    expect(result.message).toBe("region timed out");
    expect(aborted).toBe(true);
    expect(clock.now()).toBe(3_600_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("offline: keeps the region's result when its work ends inside the timeout in virtual time, and cancels the timer", async () => {
    const { clock, options } = offline();
    let timedOut = 0;

    const result = await executeWithRegionTimeout(
      async () => {
        await options.delay!(500);
        return attempt("succeeded", "in time");
      },
      1_000,
      undefined,
      () => {
        timedOut += 1;
        return attempt("failed", "region timed out");
      },
      undefined,
      options.startTimer
    );

    expect(result.message).toBe("in time");
    clock.advance(10_000);
    expect(timedOut).toBe(0);
  });

  it("live: runs on the real clock, as before", async () => {
    const options = automationStudioEnvironmentExecutorOptions({ inputs: {} }, automationStudioLiveRunEnvironment);
    const started = Date.now();

    const result = await executeWithRegionTimeout(
      // Work that never ends on its own: only the timeout can end the region.
      () => new Promise<AutomationStudioNodeAttemptTrace>(() => undefined),
      30,
      undefined,
      () => attempt("failed", "region timed out"),
      undefined,
      options.startTimer
    );

    expect(options.startTimer).toBeUndefined();
    expect(result.message).toBe("region timed out");
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
  });
});
