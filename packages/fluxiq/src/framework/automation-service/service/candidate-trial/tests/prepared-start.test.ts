// The start hook runs before the build's reset check (t475): the port's
// `prepareStart` runs it once, and the trial of that revision and digest runs
// on the start it made rather than running the hook again. Lane D round 10
// (`run-mv5tusge-1400ddf7`) spent eight model calls undoing what the hook then
// put back anyway.
import { describe, expect, it } from "vitest";
import { automationStudioCandidateTrialPort } from "../index.ts";
import { SPENT_TWO, trialFixture } from "./fixtures.ts";

describe("a trial's start prepared before the reset check", () => {
  it("runs the hook once, before the trial, and the trial records the start it made", async () => {
    const fixture = trialFixture();
    let hooks = 0;
    fixture.ports.prepareStart = async () => {
      hooks += 1;
      return { put: "back" };
    };
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    const signal = new AbortController().signal;
    expect(await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("reset");
    expect(hooks).toBe(1);
    await trials.port(fixture.request(signal));
    expect(hooks).toBe(1);
    expect(trials.records()[0]).toMatchObject({ start: { status: "reset", result: { put: "back" } } });
    // A trial with no start prepared for it runs the hook itself, as before.
    await trials.port(fixture.request(signal));
    expect(hooks).toBe(2);
  });

  it("answers failed for a hook that failed, and the trial then ends on that without running", async () => {
    const fixture = trialFixture();
    fixture.ports.prepareStart = async () => {
      throw new Error("deployment detail");
    };
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    const signal = new AbortController().signal;
    expect(await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("failed");
    expect(await trials.port(fixture.request(signal))).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_start_failed" } });
  });

  it("prepares nothing for a re-judgement, which runs nothing, and offers no prepareStart without a hook", async () => {
    const fixture = trialFixture();
    let hooks = 0;
    fixture.ports.prepareStart = async () => {
      hooks += 1;
      return {};
    };
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    fixture.setVerdict({ verdict: "not_judged", why: "The judge could not answer.", spent: { ...SPENT_TWO } });
    const signal = new AbortController().signal;
    await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal });
    await trials.port(fixture.request(signal));
    expect(hooks).toBe(1);
    expect(await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("none");
    expect(hooks).toBe(1);
    const bare = trialFixture();
    expect(automationStudioCandidateTrialPort("candidate.1", bare.ports).port.prepareStart).toBeUndefined();
  });
});
