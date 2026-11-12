import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationStudioHumanPauseMs } from "../index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";

const step = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id } } });
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.human", ownerKind: "routine", ownerId: "routine.test", name: "Human", createdAt: 1, updatedAt: 1,
  nodes: [step("s1"), step("s2"), step("s3")],
  edges: ["s1", "s2"].map((id, index) => ({ id: `${id}.success`, sourceNodeId: id, sourcePortId: "success", targetNodeId: `s${index + 2}`, targetPortId: "in" }))
};

async function run(options: AutomationStudioGraphExecutionOptions, failFirstOfS2 = false) {
  const delays: number[] = [];
  let s2 = 0;
  const trace = await runAutomationStudioGraph(flow, {
    now: () => 1_000,
    delay: async (ms) => { delays.push(ms); },
    effectDispatcher: (effect) => {
      const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
      if (failFirstOfS2 && id === "s2" && (s2 += 1) === 1) return { status: "failed", route: "failed", message: "x", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
      return { status: "success", route: "success", outputs: { ok: true } };
    },
    ...options
  });
  return { trace, delays };
}

describe("a graph run at a humanness level", () => {
  it("at 0 or absent waits exactly as before and records no humanness", async () => {
    const plain = await run({});
    const zero = await run({ humanness: 0 });
    expect(zero.delays).toEqual(plain.delays);
    expect(zero.delays).toEqual([]);
    expect("humanness" in plain.trace).toBe(false);
    expect("humanness" in zero.trace).toBe(false);
  });

  it("at 50 pauses once per node's first arrival, never per retry, and records the level and seed", async () => {
    const { trace, delays } = await run({ humanness: 50 }, true);
    const seed = trace.humanness?.seed;
    expect(trace.status).toBe("succeeded");
    expect(trace.humanness).toEqual({ level: 50, seed: expect.any(Number) });
    const expected = ["s1", "s2", "s3"].map((id) => automationStudioHumanPauseMs(50, seed!, id, 1)).filter((ms) => ms > 0);
    expect(delays.filter((ms) => expected.includes(ms))).toEqual(expected);
    expect(delays.length).toBeGreaterThanOrEqual(expected.length);
  });

  it("replays the same delays from the same seed, and honours a seed a caller passes", async () => {
    const first = await run({ humanness: 50 });
    const again = await run({ humanness: 50 });
    expect(again.delays).toEqual(first.delays);
    const seeded = await run({ humanness: 50, humannessSeed: 12345 });
    expect(seeded.trace.humanness).toEqual({ level: 50, seed: 12345 });
    expect(seeded.delays).toEqual(["s1", "s2", "s3"].map((id) => automationStudioHumanPauseMs(50, 12345, id, 1)).filter((ms) => ms > 0));
  });

  it("holds a developer's least step gap at level 0, once per node's first arrival, and adds the floor under the human pause above 0", async () => {
    const floored = await runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 400 } }, () => run({}));
    expect(floored.delays).toEqual([400, 400, 400]);
    expect("humanness" in floored.trace).toBe(false);
    const unset = await runWithAutomationStudioRunOverrides({}, () => run({}));
    expect(unset.delays).toEqual([]);
    const human = await runWithAutomationStudioRunOverrides({ pace: { minStepGapMs: 400 } }, () => run({ humanness: 50, humannessSeed: 11 }));
    expect(human.delays).toEqual(["s1", "s2", "s3"].map((id) => Math.max(400, automationStudioHumanPauseMs(50, 11, id, 1))));
  });
});
