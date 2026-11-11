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
    const forty: { humanness: number; humannessSeed?: number } = { humanness: 40 };
    expect(automationStudioHumannessSeeded(forty, 5).humannessSeed).toBe(automationStudioHumannessSeeded(forty, 5).humannessSeed);
    expect(automationStudioHumannessSeeded(forty, 5).humannessSeed).not.toBe(automationStudioHumannessSeeded(forty, 6).humannessSeed);
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

const act = (id: string) => ({ id, definitionId: "web.output.dom-click" });

describe("the pause before a node's first arrival", () => {
  it("is held only before a node that acts through a client: a domain's node or a policy action, never Core's control, data or flow nodes", () => {
    const options = { humanness: 80, humannessSeed: 4 };
    expect(automationStudioArrivalPauseMs(options, { id: "p", definitionId: "builtin.policy.action" }, 1)).toBe(automationStudioHumanPauseMs(80, 4, "p", 1));
    expect(automationStudioArrivalPauseMs(options, act("w"), 1)).toBe(automationStudioHumanPauseMs(80, 4, "w", 1));
    for (const definitionId of ["builtin.control.merge", "builtin.control.repeat", "builtin.data.set", "builtin.flow.call", "builtin.timing.wait", "builtin.logic.if"]) {
      expect(automationStudioArrivalPauseMs(options, { id: "c", definitionId }, 1), definitionId).toBe(0);
      expect(runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 250 } }, () => automationStudioArrivalPauseMs({}, { id: "c", definitionId }, 1)), definitionId).toBe(0);
    }
  });

  it("is 0 at level 0 outside any override and inside one that sets no gap", () => {
    expect(automationStudioArrivalPauseMs({}, act("a"), 1)).toBe(0);
    expect(runWithAutomationStudioRunOverrides({}, () => automationStudioArrivalPauseMs({ humanness: 0 }, act("a"), 1))).toBe(0);
  });
  it("is the developer's least step gap at level 0, and never under it above 0", () => {
    expect(runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 250 } }, () => automationStudioArrivalPauseMs({}, act("a"), 1))).toBe(250);
    expect(runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 250 } }, () => automationStudioArrivalPauseMs({ humanness: 60, humannessSeed: 2 }, act("a"), 1))).toBe(Math.max(250, automationStudioHumanPauseMs(60, 2, "a", 1)));
  });
  it("is the human pause above 0 with no override", () => {
    expect(automationStudioArrivalPauseMs({ humanness: 60, humannessSeed: 2 }, act("b"), 3)).toBe(automationStudioHumanPauseMs(60, 2, "b", 3));
  });
});
