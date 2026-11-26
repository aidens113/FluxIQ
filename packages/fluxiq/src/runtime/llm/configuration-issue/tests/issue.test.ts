// A loop that refuses its configuration says which check refused it (t584).
//
// On A8 launch 6 a builder ended `llm_evidence_loop.invalid_configuration`
// with 0 calls, twice, and nothing in the run said why. Its submit tool's
// description had outgrown the 2,000 characters a tool may describe itself
// in. These hold that a refused configuration names its check and figures,
// that the tool set's diagnosis agrees with the check that refuses the set
// (`../../evidence-loop-decision.ts`), and that a loop that runs carries none.

import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../evidence-loop.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLoopToolSetIssue } from "../issue.ts";

const inspect: AutomationStudioLlmEvidenceTool = { toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } };

function loop(overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [inspect], maxIterations: 2, maxToolCalls: 2,
    executeTool: async () => ({ facts: ["ready"] }),
    decide: async () => ({ kind: "complete", result: { answer: "done" } }),
    ...overrides
  };
}

describe("a refused configuration names its check", () => {
  it("says which limit refused, with the figures it was held to", async () => {
    const result = await runAutomationStudioLlmEvidenceLoop(loop({ minToolCalls: 1.5 }));
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration", accounting: { iterations: 0, toolCalls: 0 } });
    expect(!result.ok && result.configuration).toEqual({
      check: "limits.min_tool_calls", values: { minToolCalls: 1.5 },
      words: "minToolCalls 1.5 must be a whole number of at least 0."
    });
  });

  // No count of turns, calls or replies in a row is a limit a loop holds, so none is refused (t1056): figures an old
  // caller still passes are read by nothing.
  it("refuses no count of turns, calls or replies, which no longer bound a loop", async () => {
    const figures: Array<Partial<AutomationStudioLlmEvidenceLoopInput>> = [{ maxIterations: 65, maxToolCalls: 116 }, { maxIterations: 0, maxToolCalls: 0 }, { unusableDecisions: { stalled: () => new Error("stalled") } }];
    for (const each of figures) {
      await expect(runAutomationStudioLlmEvidenceLoop(loop(each))).resolves.toMatchObject({ ok: true });
    }
  });

  it("says the first limit refused, in the order the loop asks them", async () => {
    const stalled = await runAutomationStudioLlmEvidenceLoop(loop({ unusableDecisions: { stalled: "not a function" } } as unknown as Partial<AutomationStudioLlmEvidenceLoopInput>));
    expect(!stalled.ok && stalled.configuration).toMatchObject({ check: "limits.unusable_stalled" });
    const budget = await runAutomationStudioLlmEvidenceLoop(loop({ budget: { maxTotalTokens: 0 }, minToolCalls: -1 }));
    expect(!budget.ok && budget.configuration).toMatchObject({ check: "limits.budget", values: { maxTotalTokens: 0 } });
    const minimum = await runAutomationStudioLlmEvidenceLoop(loop({ minToolCalls: -1 }));
    expect(!minimum.ok && minimum.configuration).toMatchObject({ check: "limits.min_tool_calls", values: { minToolCalls: -1 } });
  });

  it("says which tool refused the set, and why", async () => {
    const long = { ...inspect, toolId: "core.submit_subflow", description: "d".repeat(2_001) };
    const result = await runAutomationStudioLlmEvidenceLoop(loop({ tools: [inspect, long] }));
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration", accounting: { iterations: 0, toolCalls: 0 } });
    expect(!result.ok && result.configuration).toEqual({
      check: "tool.description_length", values: { toolId: "core.submit_subflow", length: 2_001, max: 2_000 },
      words: "core.submit_subflow's description is 2001 characters; a tool's description must be 1 to 2000 characters."
    });
  });

  it("carries nothing on a loop that runs, or that fails for any other reason", async () => {
    const ran = await runAutomationStudioLlmEvidenceLoop(loop());
    expect(ran.ok).toBe(true);
    expect("configuration" in ran).toBe(false);
    const failed = await runAutomationStudioLlmEvidenceLoop(loop({ decide: async () => ({ kind: "tool_call", toolId: "nowhere", callId: "c1", input: {} }) }));
    expect(failed.ok).toBe(false);
    expect("configuration" in failed).toBe(false);
  });
});

describe("the tool set's diagnosis", () => {
  const observe = (toolId: string, extra: Partial<AutomationStudioLlmEvidenceTool> = {}): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, inputSchema: { type: "object" }, effect: "observe", ...extra });
  const refused: Array<[string, unknown[]]> = [
    ["tools.none", []],
    ["tools.too_many", Array.from({ length: 33 }, (_, index) => observe(`tool.${index}`))],
    ["tool.id", [observe("has space")]],
    ["tool.duplicate_id", [observe("a"), observe("a")]],
    ["tool.description_length", [observe("a", { description: "" })]],
    ["tool.description_length", [observe("a", { description: "d".repeat(2_001) })]],
    ["tool.input_schema", [{ ...observe("a"), inputSchema: [] }]],
    ["tool.effect", [{ ...observe("a"), effect: "delete" }]],
    ["tool.per_call_effect", [{ ...observe("a"), perCallEffect: "yes" }]],
    ["tool.action_input_key", [observe("a", { actionInputKey: "9node" })]],
    ["tool.repeat_policy", [observe("a", { effect: "mutate", repeatPolicy: "after_mutation" })]],
    ["tool.initial_observation", [observe("a", { effect: "mutate", initialObservation: { input: {} } })]],
    ["tool.initial_observation", [observe("a", { initialObservation: { input: {}, arrival: {} } })]],
    ["tools.initial_observations", [observe("a", { initialObservation: { input: {} } }), observe("b", { initialObservation: { input: {} } })]],
    ["tools.repeat_policy_without_mutation", [observe("a", { repeatPolicy: "after_mutation" })]]
  ];

  it.each(refused)("names %s for a set the loop's own check refuses", (check, tools) => {
    expect(automationStudioLlmEvidenceValidTools(tools as AutomationStudioLlmEvidenceTool[])).toBe(false);
    expect(automationStudioLlmEvidenceLoopToolSetIssue(tools).check).toBe(check);
  });

  it("is held to the same bounds as that check: 32 tools and 2,000 characters are allowed", () => {
    expect(automationStudioLlmEvidenceValidTools(Array.from({ length: 32 }, (_, index) => observe(`tool.${index}`)))).toBe(true);
    expect(automationStudioLlmEvidenceValidTools([observe("a", { description: "d".repeat(2_000) })])).toBe(true);
  });
});
