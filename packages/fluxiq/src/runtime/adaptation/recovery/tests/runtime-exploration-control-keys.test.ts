import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

// A recovery's exploration keeps a draft of its own, so a model can rerun a step
// that already did its lasting act there too. That check needs the domain's keys:
// with none it refuses every new value (`../../../llm/node-tools/rerun-check.ts`),
// which would have changed what a web recovery could do. This drives the real loop.

const PRESS: AutomationStudioLlmEvidenceTool = { toolId: "test.press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" };

function holders(value: unknown, key: string): JsonObject[] {
  if (value === null || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [...(Object.hasOwn(object, key) ? [object as JsonObject] : []), ...Object.values(object).flatMap((item) => holders(item, key))];
}

/** Presses, reruns that press with a new `note`, and answers what the rerun's check said. */
async function rerunInExploration(controlParameterKeys: ReadonlySet<string> | undefined): Promise<{ note: JsonObject | undefined; presses: number; checks: number }> {
  let presses = 0;
  let checks = 0;
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "test.domain", deniedEvidenceKeys: [], tools: [PRESS],
      executeTool: async ({ value }) => {
        if (value.replay === "verify") {
          checks += 1;
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true, code: "core.replay.verified" }, effectApplied: false, resultCode: "core.replay.verified" };
        }
        if (value.replay) return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
        presses += 1;
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "test.press", input: value, ranWith: value, effect: "mutate", proposes: true } };
      }
    }
  });
  let turn = 0;
  let note: JsonObject | undefined;
  const decide: AutomationStudioLlmEvidenceLoopInput["decide"] = async (decision) => {
    turn += 1;
    if (turn === 1) return { kind: "tool_call", callId: "press", toolId: "test.press", input: { handle: "first", note: "hi", consequences: ["modify_existing"] }, add: true };
    if (turn === 2) return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { note: "hello" } }] };
    note = holders(decision.evidence, "rerunCheck")[0]?.rerunCheck as JsonObject | undefined;
    return { kind: "complete", result: {} };
  };
  await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    ...(controlParameterKeys ? { controlParameterKeys } : {}),
    decide,
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 })
  });
  return { note, presses, checks };
}

describe("a rerun of a done act inside an exploration", () => {
  it("is checked and takes a new value when the domain says which keys name the control", async () => {
    const { note, presses, checks } = await rerunInExploration(new Set(["handle"]));
    expect(note).toMatchObject({ checked: true, doneAgain: false, took: true });
    expect([presses, checks]).toEqual([1, 1]);
  });

  it("is checked and refused as another control when the domain says nothing", async () => {
    const { note, presses, checks } = await rerunInExploration(undefined);
    expect(note).toMatchObject({ checked: true, doneAgain: false, took: false });
    expect(note!.detail).toContain("another control");
    expect([presses, checks]).toEqual([1, 1]);
  });
});
