// A loop handed a draft to start from, which is what makes editing a Flow the
// same act as building one.
//
// The property under test is that a seed is an ordinary part of the draft from
// the first decision onward: the model is shown it, an amendment names it, a
// step the loop takes is appended after it, and the whole list comes back. If
// any of that were special-cased, an extend would be a second authoring path
// beside creation -- which is the duplication this design exists to avoid.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { automationStudioLlmEvidenceLoopSeedSteps } from "../loop-configuration.ts";

const tools = [{ toolId: "act", description: "Do one thing to the target.", inputSchema: { type: "object" }, effect: "mutate" as const }];

/** Two steps a Flow already contained, numbered by whoever built the seed. */
function seed(): AutomationStudioFlowDraftStep[] {
  return [
    { position: 7, id: "f1", iteration: 0, actionId: "web.page.navigate", toolId: "act", input: { node: "web.page.navigate" }, effect: "mutate", proposes: true, disposition: "kept" },
    { position: 8, id: "f2", iteration: 0, actionId: "web.dom.extract_list", toolId: "act", input: { node: "web.dom.extract_list" }, effect: "mutate", proposes: true, disposition: "kept" }
  ];
}

describe("the steps a loop starts with", () => {
  it("renumbers the seed from 1, whatever the caller numbered it", () => {
    expect(automationStudioLlmEvidenceLoopSeedSteps({ seed: seed() }).map((step) => step.position)).toEqual([1, 2]);
    expect(automationStudioLlmEvidenceLoopSeedSteps({ seed: seed() }).map((step) => step.id)).toEqual(["f1", "f2"]);
  });

  it("starts empty for a build that writes a Flow from nothing", () => {
    expect(automationStudioLlmEvidenceLoopSeedSteps(undefined)).toEqual([]);
    expect(automationStudioLlmEvidenceLoopSeedSteps(false)).toEqual([]);
  });
});

describe("a loop that starts from a draft", () => {
  it("shows the model the seed, appends what it then runs, and returns the whole list", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "act", input: { node: "web.dom.type" } })
      .mockResolvedValueOnce({ kind: "complete", result: { summary: "Searched, then extracted." } });
    const executeTool = vi.fn().mockResolvedValue({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.type", proposes: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, draft: { seed: seed() } });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => [step.id, step.position, step.actionId])).toEqual([
      ["f1", 1, "web.page.navigate"],
      ["f2", 2, "web.dom.extract_list"],
      // The loop mints its own ids from its own counter, so nothing it appends
      // can collide with a seeded step an amendment might name.
      ["d1", 3, "web.dom.type"]
    ]);
    // The seed reaches the model as its own draft from the first decision.
    const shown = decide.mock.calls[0]?.[0].evidence.find((entry: { toolId: string }) => entry.toolId === "core.flow_draft");
    expect(JSON.stringify(shown)).toContain("web.page.navigate");
  });

  it("lets an amendment edit a step the loop never took", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "act", input: { node: "web.dom.extract_list" } })
      .mockResolvedValueOnce({ kind: "complete", result: { summary: "Replaced the extraction." } });
    const executeTool = vi.fn().mockResolvedValue({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.extract_list", proposes: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, draft: { seed: seed() } });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["f1", "kept"], ["f2", "dropped"], ["d1", "kept"]]);
  });

  it("hands a failed loop the seed back too, so a build that ended early still says what the Flow was", async () => {
    const decide = vi.fn().mockResolvedValue({ kind: "tool_call", callId: "call.1", toolId: "unknown", input: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: vi.fn(), draft: { seed: seed() } });
    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.id)).toEqual(["f1", "f2"]);
  });
});
