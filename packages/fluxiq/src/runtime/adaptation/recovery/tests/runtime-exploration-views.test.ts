// A repair's exploration is shown the newest view of the target whole, once, in
// the current view, and every result in its history holds a reference to its
// own view, as a build is (B1, t830, `../../../llm/decision-context/current-view.ts`):
// the declaration reaches it through the same registry binding.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioHarnessOptionRegistry } from "../../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

const reference = (callId: string): JsonObject => ({ "core.view_reference": { callId, group: "top" } });
const currentView = (callId: string, area: string): JsonObject => ({ groups: [{ group: "top", callId, value: { controls: [{ handle: "c1", name: `Control in ${area}` }] } }] });

describe("what a repair's exploration is shown of the views it took", () => {
  it("the newest whole in the current view, each result by a reference to its own call", async () => {
    const shown: Array<Map<string, JsonValue>> = [];
    const decisions: JsonObject[] = [
      { kind: "tool_call", callId: "call.look.1", toolId: "shop.look", input: { area: "order" } },
      { kind: "tool_call", callId: "call.look.2", toolId: "shop.look", input: { area: "refunds" } },
      { kind: "complete", result: { findings: "The refund line is in the second view." } }
    ];
    const registry = automationStudioHarnessOptionRegistry({
      binding: {
        domainId: "shop",
        deniedEvidenceKeys: [],
        observedStateKeys: ["controls"],
        tools: [{ toolId: "shop.look", description: "Read one area of the order.", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async (input) => ({
          kind: "llm_evidence_tool_execution",
          evidence: { area: String(input.value.area), controls: [{ handle: "c1", name: `Control in ${String(input.value.area)}` }] },
          effectApplied: false
        })
      }
    });
    await runAutomationStudioRuntimeExploration({
      loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
      decide: async (decision) => {
        shown.push(new Map(decision.evidence.map((entry) => [entry.callId, entry.value])));
        return decisions[shown.length - 1] ?? { kind: "complete", result: {} };
      },
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
      instructionIds: ["instruction.refund"],
      now: () => 1_000
    });

    expect(shown[1]?.get("call.look.1")).toEqual({ area: "order", controls: reference("call.look.1") });
    expect(shown[1]?.get("core.current_view")).toEqual(currentView("call.look.1", "order"));
    // The earlier result reads as it did, byte for byte; only the current view moved on.
    expect(shown[2]?.get("call.look.1")).toEqual(shown[1]?.get("call.look.1"));
    expect(shown[2]?.get("call.look.2")).toEqual({ area: "refunds", controls: reference("call.look.2") });
    expect(shown[2]?.get("core.current_view")).toEqual(currentView("call.look.2", "refunds"));
    expect(JSON.stringify([...shown[2]!.values()])).not.toContain("Control in order");
  });
});
