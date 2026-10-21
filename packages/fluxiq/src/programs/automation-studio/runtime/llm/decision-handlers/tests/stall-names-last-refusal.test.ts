// A stall of refused repeats names the last refusal before them (`../refused-repeat.ts`, t748).
//
// Live run `run-mvgw7320-de416190`: a reset brief's one press was refused by
// Core, and the builder then asked the same look until the guard ended the
// brief on three refused repeats. The stall carried only the guard's own code,
// so neither the debug nor the supervisor could see which answer stranded the
// builder. What is refused is unchanged; only the stall's codes say more.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "find", description: "Search the page for text.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
const press = (index: number, target: string) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target } });
const find = (index: number) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } });

/** A page that never moves: a press is refused with `refusal`, or, without one, runs and changes nothing; a find matches nothing. */
function site(refusal?: string) {
  const result = (fields: JsonObject) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, ...fields });
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    if (toolId === "find") return result({ evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", draft: { actionId: "web.find", effect: "observe", proposes: false } });
    const evidence = refusal ? { ok: false, code: refusal } : { ok: true };
    return result({ evidence, effectApplied: false, ...(refusal ? { resultCode: refusal } : {}), draft: { actionId: "web.click", effect: "mutate", proposes: true } });
  });
}

async function stalledCodes(decisions: JsonObject[], refusal?: string): Promise<readonly string[]> {
  const decide = vi.fn();
  for (const decision of decisions) decide.mockResolvedValueOnce(decision);
  decide.mockResolvedValue({ kind: "complete", result: { done: true } });
  const stalled = vi.fn((input: { issueCodes: readonly string[] }) => Object.assign(new Error("stalled"), { issueCodes: [...input.issueCodes] }));
  await expect(runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: site(refusal), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { maxConsecutive: 8, stalled }
  })).rejects.toThrow("stalled");
  expect(stalled).toHaveBeenCalledTimes(1);
  return stalled.mock.calls[0]![0].issueCodes;
}

describe("a stall of refused repeats", () => {
  it("carries the code of the refusal the repeats followed, after the guard's own", async () => {
    const codes = await stalledCodes([press(1, "Menu toggle"), press(2, "Menu toggle"), press(3, "Menu toggle"), press(4, "Menu toggle")], "web.action.rejected.example_gate");
    expect(codes).toEqual(["llm_evidence_loop.repeat_refused", "llm_evidence_loop.last_refusal:web.action.rejected.example_gate"]);
  });

  it("still names that refusal when a call that worked ran between it and the repeats", async () => {
    const codes = await stalledCodes([press(1, "Menu toggle"), find(2), press(3, "Menu toggle"), press(4, "Menu toggle"), press(5, "Menu toggle")], "web.action.rejected.example_gate");
    expect(codes).toEqual(["llm_evidence_loop.repeat_refused", "llm_evidence_loop.last_refusal:web.action.rejected.example_gate"]);
  });

  it("carries only the guard's code when nothing before the repeats was refused", async () => {
    const codes = await stalledCodes([press(1, "Menu toggle"), press(2, "Menu toggle"), press(3, "Menu toggle"), press(4, "Menu toggle")]);
    expect(codes).toEqual(["llm_evidence_loop.repeat_refused"]);
  });
});
