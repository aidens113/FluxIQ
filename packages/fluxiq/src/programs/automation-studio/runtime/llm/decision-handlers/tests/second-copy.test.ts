// A call with `add` whose step copies a step already in the Flow stays taken,
// and the model is told so beside the call (`../second-copy.ts`,
// `../../../flow-draft/second-copy.ts`), in the words an amendment refused
// `second_copy` is told in (`../../draft-amendment-feedback.ts`). Live run
// `run-murwdp4f-35f976d2` (C9, rows 0038-0046): the call `click t1212, add`
// repeated step 18's press from the same results page and became step 21, a
// second copy in the Flow. Live run `run-muq4oaof-464f5bce` (cause 3) kept two
// reads of one list, which the host names by `reads`.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceCallRecord } from "../../evidence-loop/index.ts";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../../draft-amendment-feedback.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../../flow-draft/index.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

const press = (callId: string, target: string, over: JsonObject = {}) => ({ kind: "tool_call", callId, toolId: "go", input: { target }, ...over });
const ran = (before: string, after: string, draft: JsonObject = {}): JsonValue => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, stateDigests: { before, after },
  draft: { actionId: "web.dom.click", proposes: true, effect: "mutate", ...draft }
});
const read = (before: string, reads?: string | number, effect: "observe" | "mutate" = "observe"): JsonValue => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true, rows: [] }, effectApplied: true, stateDigests: { before, after: before },
  draft: { actionId: "web.extract.list", proposes: true, effect, ...(reads === undefined ? {} : { reads }) }
});

describe("a call's statement of the list a read reads", () => {
  it("is carried on the parse path and onto the call's record, only on a read", () => {
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(read("s1", "list-requests"), "observe")!;
    expect(parsed.draft?.reads).toBe("list-requests");
    expect(automationStudioLlmEvidenceCallRecord(go, {}, parsed).reads).toBe("list-requests");
    expect(automationStudioLlmEvidenceCallRecord(go, {}, {})).not.toHaveProperty("reads");
  });

  it("is withheld, never refused, when it is no code or on a statement that changed something", () => {
    for (const [reads, effect] of [["<b>a list</b>", "observe"], [7, "observe"], ["list-requests", "mutate"]] as const) {
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult(read("s1", reads, effect), "observe");
      expect(parsed?.effectApplied, String(reads)).toBe(true);
      expect(parsed?.draft, String(reads)).not.toHaveProperty("reads");
    }
  });
});

describe("a call with add that copies a step already in the Flow", () => {
  it("run murwdp4f C9: the 3-Pack press again from the same results page stays taken, and the model is told step 1 already does it", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press("c1", "t1212", { add: true }))
      .mockResolvedValueOnce(press("c2", "t1378"))
      .mockResolvedValueOnce(press("c3", "t1212", { add: true, act: "a3" }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn()
      .mockResolvedValueOnce(ran("s-results", "s-product"))
      .mockResolvedValueOnce(ran("s-product", "s-results"))
      .mockResolvedValueOnce(ran("s-results", "s-product"));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(executeTool).toHaveBeenCalledTimes(3);
    // No act claim, no openers (step 2 left step 3's page as it found it), no reversal.
    expect(result.steps.map((step) => [step.id, step.disposition, step.acts])).toEqual([["d1", "kept", undefined], ["d2", "taken", undefined], ["d3", "taken", undefined]]);
    const told = shownAt(decide, 3).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(told).toMatchObject({ refused: [{ step: 3, reason: "second_copy", copyOf: 1 }] });
    const [entry] = (told as { refused: { next?: string }[] }).refused;
    expect(entry?.next).toBe("Step 3 was not added to the Flow: step 1 already does this (the same press on the same page); the Flow does each step once.");
    // Said after the call's own answer, in the same call's feedback.
    const shown = shownAt(decide, 3).map((item) => item.toolId);
    expect(shown.indexOf("core.amendment_check")).toBeGreaterThan(shown.lastIndexOf("go"));
  });

  it("a second read of the same list with nothing kept changed between stays taken; after a kept press it joins", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press("c1", "list", { add: true }))
      .mockResolvedValueOnce(press("c2", "list where 2", { add: true }))
      .mockResolvedValueOnce(press("c3", "t-next", { add: true }))
      .mockResolvedValueOnce(press("c4", "list where 4", { add: true }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn()
      .mockResolvedValueOnce(read("s1", "list-requests"))
      .mockResolvedValueOnce(read("s1b", "list-requests"))
      .mockResolvedValueOnce(ran("s1", "s2"))
      .mockResolvedValueOnce(read("s2", "list-requests"));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "kept"], ["d2", "taken"], ["d3", "kept"], ["d4", "kept"]]);
    const told = shownAt(decide, 2).find((entry) => entry.toolId === "core.amendment_check")?.value as { refused: { next?: string }[] };
    expect(told.refused[0]?.next).toBe("Step 2 was not added to the Flow: step 1 already does this (a read of the same list with nothing changed in between); the Flow does each step once.");
  });

  it("a press from another page joins the Flow as before", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press("c1", "t-plus", { add: true }))
      .mockResolvedValueOnce(press("c2", "t-plus", { add: true }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce(ran("s-qty-1", "s-qty-2")).mockResolvedValueOnce(ran("s-qty-2", "s-qty-3"));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((step) => step.disposition)).toEqual(["kept", "kept"]);
    expect(shownAt(decide, 2).some((entry) => entry.toolId === "core.amendment_check")).toBe(false);
  });
});

// The words both refusals are told in (`../../draft-amendment-feedback.ts`,
// `second_copy`): the step that already does it, as `copyOf` and in `next`.
describe("the feedback a step not added as a second copy is told", () => {
  const steps = [{ position: 1, effect: "mutate" }, { position: 2, effect: "observe" }, { position: 3, effect: "mutate" }, { position: 4, effect: "observe" }];
  const feedbackOf = (refusals: readonly AutomationStudioFlowDraftAmendmentRefusal[], actsNotDone?: readonly string[]) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied: 0, steps, stepsWithoutProgress: 0, maxStepsWithoutProgress: 8, actsNotDone });
  const refusedOf = (feedback: Record<string, unknown>) => feedback.refused as { step: number; reason: string; copyOf?: number; next?: string }[];

  it("names the step that already does it, as copyOf and in next, for a press, with the checklist after it", () => {
    const feedback = feedbackOf([{ step: 3, reason: "second_copy", copyOf: 1 }], ["a3"]);
    const [entry] = refusedOf(feedback);
    expect(entry).toMatchObject({ step: 3, reason: "second_copy", copyOf: 1 });
    expect(entry?.next).toBe("Step 3 was not added to the Flow: step 1 already does this (the same press on the same page); the Flow does each step once. Still not done on the checklist: a3. Go on with those.");
    expect((feedback.reasons as Record<string, string>).second_copy).toContain("copyOf names the step");
  });

  it("says a read of the same list for a read, and both kinds where the draft does not say", () => {
    expect(refusedOf(feedbackOf([{ step: 4, reason: "second_copy", copyOf: 2 }]))[0]?.next)
      .toBe("Step 4 was not added to the Flow: step 2 already does this (a read of the same list with nothing changed in between); the Flow does each step once.");
    expect(refusedOf(feedbackOf([{ step: 4, reason: "second_copy", copyOf: 9 }]))[0]?.next)
      .toContain("(the same press on the same page, or a read of the same list with nothing changed in between)");
  });
});
