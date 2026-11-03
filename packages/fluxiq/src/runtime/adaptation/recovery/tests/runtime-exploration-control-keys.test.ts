import { describe, expect, it, vi } from "vitest";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

// A recovery's exploration keeps a draft of its own, so a model can rerun a step
// that already did its lasting act there too. That check needs the domain's keys:
// with none it refuses every new value (`../../../llm/node-tools/rerun-check.ts`),
// which would have changed what a web recovery could do.

const seenKeys = vi.hoisted(() => ({ value: undefined as ReadonlySet<string> | undefined, asked: 0 }));

vi.mock("../../../llm/index.ts", async (original) => {
  const actual = await original<typeof import("../../../llm/index.ts")>();
  return {
    ...actual,
    runAutomationStudioLlmEvidenceLoop: (...args: Parameters<typeof actual.runAutomationStudioLlmEvidenceLoop>) => {
      seenKeys.value = args[0].controlParameterKeys;
      seenKeys.asked += 1;
      return actual.runAutomationStudioLlmEvidenceLoop(...args);
    }
  };
});

describe("an exploration's loop", () => {
  it("is given the keys the domain's bundle declares", async () => {
    const keys = new Set(["handle"]);
    await runAutomationStudioRuntimeExploration({
      loop: { tools: [], executeTool: async () => ({ ok: true }) },
      controlParameterKeys: keys,
      decide: async () => ({ kind: "complete", result: {} }),
      budget: resolveAutomationStudioExplorationBudget()
    });
    expect(seenKeys.asked).toBe(1);
    expect(seenKeys.value).toBe(keys);
  });
});
