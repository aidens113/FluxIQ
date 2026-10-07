// A claim the act judge would reject is refused as it is made, on both ways of
// making one: a call run with add and act (`../amendment.ts`,
// `automationStudioLlmEvidenceClaimWrittenAct`) and an amend_draft naming act
// (`../../../flow-draft/amendment/apply.ts`, `claimRefused`). Week report W1:
// live run `run-mux74k5q-1c3c2127` (C1b) put a1, "put the hub in my cart", on
// the press of "Spain", one of a1's own options; it was answered "applied",
// the claim stuck to the step, and the model learnt only from the checklist.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { automationStudioFlowBootstrapDraftActs, runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const HUB = "Put three of the Voltbay USB-C hub in my cart: Space Grey, the 7-in-1 version, shipped from Spain.";
const go = { toolId: "go", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const toldAt = (decide: { mock: { calls: unknown[][] } }, index: number) => shownAt(decide, index).find((entry) => entry.toolId === "core.amendment_check")?.value;

const press = (callId: string, target: string, over: JsonObject = {}) => ({ kind: "tool_call", callId, toolId: "go", input: { target }, ...over });
/** A press on the product page that leaves it there, its control's words shown in its own evidence. */
const pressed = (control: string, before: string, after: string): JsonValue => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true, pressed: control }, effectApplied: true, stateDigests: { before, after },
  draft: { actionId: "web.dom.click", proposes: true, effect: "mutate", control, replay: { from: { location: "item" } } }
});

describe("run mux74k5q: a1 claimed on the press of Spain", () => {
  it("a call with add and act a1 keeps the step without a1, and tells act_not_done_there with the checklist's sentence", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press("c1", "t-grey", { add: true }))
      .mockResolvedValueOnce(press("c2", "t-spain", { add: true, act: "a1" }))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "keep", act: "a1" }] })
      .mockResolvedValueOnce(press("c4", "t-add", { add: true, act: "a1" }))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const executeTool = vi.fn()
      .mockResolvedValueOnce(pressed("Space Grey", "s1", "s2"))
      .mockResolvedValueOnce(pressed("Spain", "s2", "s3"))
      .mockResolvedValueOnce(pressed("Add to cart", "s3", "s4"));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled },
      draft: automationStudioFlowBootstrapDraftActs({ instructionText: HUB })
    });

    // The call: kept, without a1, and told why beside its answer.
    const call = toldAt(decide, 2) as { refused: { step: number; reason: string; act?: string; said?: string; next?: string }[] };
    expect(call.refused).toEqual([expect.objectContaining({ step: 2, reason: "act_not_done_there", act: "a1" })]);
    expect(call.refused[0]!.said).toContain('Step 2 chose "Spain", one of a1\'s options (a1.origin)');
    expect(call.refused[0]!.next).toContain('Step 2 chose "Spain"');
    expect(call.refused[0]!.next).toContain("a1 was not recorded on step 2");

    // The amendment: refused, the step's acts unchanged, counted as no progress.
    const amend = toldAt(decide, 3) as { refused: { reason: string }[]; applied: number; stepsWithoutProgress: number };
    expect(amend.refused).toEqual([expect.objectContaining({ step: 2, reason: "act_not_done_there", act: "a1" })]);
    expect(amend.applied).toBe(0);
    expect(amend.stepsWithoutProgress).toBeGreaterThan(0);
    const row = result.trace.find((entry) => entry.decision === "amend_draft");
    expect(row?.resultCode).toBe("llm_evidence_loop.draft_unchanged");

    // The press whose words name the act takes it.
    expect(result.steps.map((step) => [step.position, step.disposition, step.acts])).toEqual([[1, "kept", undefined], [2, "kept", undefined], [3, "kept", ["a1"]]]);
    expect(toldAt(decide, 4)?.refused ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ step: 3 })]));
  });

  it("claims as before where no judge is given", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press("c1", "t-spain", { add: true, act: "a1" }))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const executeTool = vi.fn().mockResolvedValueOnce(pressed("Spain", "s1", "s2"));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps[0]!.acts).toEqual(["a1"]);
  });
});
