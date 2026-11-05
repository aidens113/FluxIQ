import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptsInFlight, trackAutomationStudioTaskAttempt } from "../index.ts";

describe("task attempts in flight", () => {
  it("counts an attempt while it waits, and not once it ended", async () => {
    const owner = {};
    let answer!: () => void;
    const attempt = trackAutomationStudioTaskAttempt(owner, () => new Promise<string>((resolve) => { answer = () => resolve("done"); }));
    expect(automationStudioTaskAttemptsInFlight(owner)).toBe(1);
    answer();
    await expect(attempt).resolves.toBe("done");
    expect(automationStudioTaskAttemptsInFlight(owner)).toBe(0);
  });
  it("stops counting an attempt that threw", async () => {
    const owner = {};
    await expect(trackAutomationStudioTaskAttempt(owner, async () => { throw new Error("stopped"); })).rejects.toThrow("stopped");
    expect(automationStudioTaskAttemptsInFlight(owner)).toBe(0);
  });
  it("keeps one count per service", async () => {
    const [a, b] = [{}, {}];
    let end!: () => void;
    const attempt = trackAutomationStudioTaskAttempt(a, () => new Promise<void>((resolve) => { end = resolve; }));
    expect(automationStudioTaskAttemptsInFlight(a)).toBe(1);
    expect(automationStudioTaskAttemptsInFlight(b)).toBe(0);
    end();
    await attempt;
  });
});
