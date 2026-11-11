// A run's modelSilence (W3, t899) is the base and cap of the schedule of waits, never a limit on how many times it asks.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { automationStudioAnswerFirstBackoff } from "../index.ts";

const waits = (counts: number[]) => counts.map((n) => automationStudioAnswerFirstBackoff(n).waitMs);

describe("backoff under a run's modelSilence", () => {
  it("doubles from the run's base to the run's cap, and still never runs out", () => {
    const got = runWithAutomationStudioRunOverrides({ deadlines: { modelSilence: { baseMs: 1_000, capMs: 8_000 } } }, () => waits([0, 1, 2, 3, 4, 50, 1e9]));
    expect(got).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000]);
  });

  it("takes the other default when only one of the two is given", () => {
    expect(runWithAutomationStudioRunOverrides({ deadlines: { modelSilence: { capMs: 7_000 } } }, () => waits([0, 1, 2]))).toEqual([5_000, 7_000, 7_000]);
    expect(runWithAutomationStudioRunOverrides({ deadlines: { modelSilence: { baseMs: 2_000 } } }, () => waits([0, 1, 5, 6]))).toEqual([2_000, 4_000, 60_000, 60_000]);
  });

  it("states the run's wait in its sentence", () => {
    const say = runWithAutomationStudioRunOverrides({ deadlines: { modelSilence: { baseMs: 3_000, capMs: 9_000 } } }, () => automationStudioAnswerFirstBackoff(0).say);
    expect(say).toContain("waiting 3 seconds");
  });

  it("is 5, 10, 20, 40, 60 s without a frame or without modelSilence", () => {
    expect(waits([0, 1, 2, 3, 4, 9])).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
    expect(runWithAutomationStudioRunOverrides({ deadlines: { llmCallMs: 9_000 } }, () => waits([0, 4]))).toEqual([5_000, 60_000]);
  });

  it("gives two concurrent runs their own schedule", async () => {
    const read = (modelSilence: { baseMs: number; capMs: number }) => runWithAutomationStudioRunOverrides({ deadlines: { modelSilence } }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return waits([0, 9]);
    });
    const [a, b] = await Promise.all([read({ baseMs: 1_000, capMs: 2_000 }), read({ baseMs: 10_000, capMs: 90_000 })]);
    expect(a).toEqual([1_000, 2_000]);
    expect(b).toEqual([10_000, 90_000]);
  });
});
