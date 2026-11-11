import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../contracts.ts";
import { automationStudioArrivalPauseMs, automationStudioHumanPauseMs, automationStudioHumannessSeeded, automationStudioTraceWithHumanness } from "../index.ts";

describe("the humanness seed a run starts with", () => {
  it("returns the very same options at level 0 or with a seed already given", () => {
    const zero = { humanness: 0 }, none = {}, given = { humanness: 40, humannessSeed: 9 };
    expect(automationStudioHumannessSeeded(zero, 5)).toBe(zero);
    expect(automationStudioHumannessSeeded(none, 5)).toBe(none);
    expect(automationStudioHumannessSeeded(given, 5)).toBe(given);
  });
  it("follows from the run's start above 0", () => {
    expect(automationStudioHumannessSeeded({ humanness: 40 }, 5).humannessSeed).toBe(automationStudioHumannessSeeded({ humanness: 40 }, 5).humannessSeed);
    expect(automationStudioHumannessSeeded({ humanness: 40 }, 5).humannessSeed).not.toBe(automationStudioHumannessSeeded({ humanness: 40 }, 6).humannessSeed);
  });
});

describe("the humanness a trace records", () => {
  const trace = { status: "succeeded", startedAt: 1, attempts: [] } as unknown as AutomationStudioGraphExecutionTrace;
  it("is the very same trace at level 0", () => {
    expect(automationStudioTraceWithHumanness(trace, {})).toBe(trace);
    expect(automationStudioTraceWithHumanness(trace, { humanness: 0, humannessSeed: 3 })).toBe(trace);
  });
  it("carries the level and seed above 0", () => {
    expect(automationStudioTraceWithHumanness(trace, { humanness: 70, humannessSeed: 3 }).humanness).toEqual({ level: 70, seed: 3 });
  });
});

describe("the pause before a node's first arrival", () => {
  it("is 0 at level 0 outside any override and inside one that sets no gap", () => {
    expect(automationStudioArrivalPauseMs({}, "a", 1)).toBe(0);
    expect(runWithAutomationStudioRunOverrides({}, () => automationStudioArrivalPauseMs({ humanness: 0 }, "a", 1))).toBe(0);
  });
  it("is the developer's least step gap at level 0, and never under it above 0", () => {
    expect(runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 250 } }, () => automationStudioArrivalPauseMs({}, "a", 1))).toBe(250);
    expect(runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 250 } }, () => automationStudioArrivalPauseMs({ humanness: 60, humannessSeed: 2 }, "a", 1))).toBe(Math.max(250, automationStudioHumanPauseMs(60, 2, "a", 1)));
  });
  it("is the human pause above 0 with no override", () => {
    expect(automationStudioArrivalPauseMs({ humanness: 60, humannessSeed: 2 }, "b", 3)).toBe(automationStudioHumanPauseMs(60, 2, "b", 3));
  });
});
