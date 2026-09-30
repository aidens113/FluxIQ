// An amendment the draft refused reaches the model, and the row records it.
//
// `run-muhubegx-9469de5e` made nine amend_draft decisions, seven of which
// changed nothing and five of those in a row. The draft computed a precise
// reason for every one of them; the loop read only how many had landed, so the
// model was asked again with nothing to correct and the record kept one word
// for all seven. These pin both halves: what the model is told, and what the
// row carries.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID,
  automationStudioLlmEvidenceDraftAmendmentFeedback,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceLoopTrace
} from "../index.ts";

const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const tools = [press];
const stalled = () => new Error("stalled");
// Each press is one the Flow needs, so it is added to the Flow as it runs.
const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` }, add: true });
const complete = { kind: "complete", result: { flow: "..." } };

/** A tool that always works, with an evidence value of the size asked for. */
const pressing = (bytes = 0) => async () => ({
  kind: "llm_evidence_tool_execution" as const,
  evidence: { page: "after", ...(bytes ? { filler: "z".repeat(bytes) } : {}) },
  effectApplied: true
});

type ShownEntry = { callId: string; toolId: string; value: Record<string, unknown> };

/** What the decision at `index` was shown under the amendment-feedback tool id. */
function feedbackShown(decide: ReturnType<typeof vi.fn>, index: number): Record<string, unknown> | undefined {
  const shown = decide.mock.calls[index]?.[0].evidence as ShownEntry[] | undefined;
  return shown?.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID)?.value;
}

const amendRow = (trace: AutomationStudioLlmEvidenceLoopTrace[]): AutomationStudioLlmEvidenceLoopTrace | undefined =>
  trace.find((entry) => entry.decision === "amend_draft");

describe("an amendment the draft refused", () => {
  it("is told to the model, by step and reason, before it is asked again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.draft_amendments_refused",
      refused: [{ step: 9, reason: "no_such_step" }],
      applied: 0,
      steps: 1,
      // The draft has one step, so 9 was never a number it could have named.
      positions: [1]
    });
    expect((feedback?.reasons as Record<string, string>).no_such_step).toContain("no step at that number");
    expect(feedback?.stepsWithoutProgress).toBe(1);
  });

  it("is recorded on the amend row beside the count that landed", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      // One amendment lands and one is refused, which the single result code
      // cannot say and the row now does.
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }, { step: 4, change: "drop" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_amended",
      amended: 1,
      amendmentsRefused: [{ step: 4, reason: "no_such_step" }]
    });
    // Half an edit landing is still an edit the model must be told about.
    expect(feedbackShown(decide, 2)).toMatchObject({ applied: 1, refused: [{ step: 4, reason: "no_such_step" }] });
  });

  it("names the reason the draft computed, not a guess at the step meant", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      // The step is already in the Flow: it was added as it ran.
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_unchanged",
      amended: 0,
      amendmentsRefused: [{ step: 1, reason: "already_in_flow" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "already_in_flow" }] });
    // Nothing was named that does not exist, so no positions are listed.
    expect(feedback?.positions).toBeUndefined();
  });

  it("leaves an edit that landed cleanly with nothing to explain", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)?.amendmentsRefused).toBeUndefined();
    expect(feedbackShown(decide, 2)).toBeUndefined();
  });

  // The entry is counted against the byte limit like any other the loop adds.
  // The row is recorded first, so the record still says what the decision was
  // and why it changed nothing even when there is no room to say it to the model.
  it("ends the loop on the evidence limit when there is no room left for it, and keeps the row", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] })
      .mockResolvedValue(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, maxEvidenceBytes: 1_024, maxEvidenceContextBytes: 1_024,
      unusableDecisions: { stalled }, executeTool: pressing(850)
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.evidence_limit" });
    expect(amendRow(result.trace)).toMatchObject({ amended: 0, amendmentsRefused: [{ step: 9, reason: "no_such_step" }] });
    expect(decide).toHaveBeenCalledTimes(2);
  });
});

// `rerun` is the one amendment the draft does not carry out, so the loop filters
// it out of the apply call and resolves it itself
// (`../evidence-loop/rerun-request.ts`). That left one amendment able to change
// nothing in silence after every other kind had stopped: the row read
// `draft_unchanged`, no refusal existed to record, and `run_by_the_loop` -- a
// reason the draft computes -- could not occur on the loop path at all.
describe("a rerun the loop cannot carry out", () => {
  it("reaches the model as a refusal naming a step that is not there, and is recorded on the row", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 6, change: "rerun", input: { target: "target.6" } }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_unchanged",
      amended: 0,
      amendmentsRefused: [{ step: 6, reason: "no_such_step" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 6, reason: "no_such_step" }], applied: 0, positions: [1] });
    // The guard's arithmetic is untouched: an amend decision that changed
    // nothing counts once, and the count the model is shown is that one.
    expect(feedback?.stepsWithoutProgress).toBe(1);
  });

  it("is the second rerun of one decision, told as run_by_the_loop while the first one runs", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({
        kind: "amend_draft",
        amendments: [
          { step: 1, change: "rerun", input: { target: "target.1b" } },
          { step: 1, change: "rerun", input: { target: "target.1c" } }
        ]
      })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      // The rerun was carried out, and the one that could not be is still said.
      resultCode: "llm_evidence_loop.draft_rerun",
      amendmentsRefused: [{ step: 1, reason: "run_by_the_loop" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "run_by_the_loop" }] });
    expect((feedback?.reasons as Record<string, string>).run_by_the_loop).toContain("rerun");
    // A rerun that ran is progress on the evidence, so nothing was counted
    // against the no-progress guard for the refusal beside it.
    expect(result.trace.filter((entry) => entry.decision === "tool_call")).toHaveLength(2);
  });
});

describe("the feedback an amendment refusal is shown as", () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];
  const built = (refusals: readonly AutomationStudioFlowDraftAmendmentRefusal[], applied = 0) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });

  // Exhaustive by type: a reason added to the draft's closed set fails to
  // compile here until this test names it, and in the module until it is
  // explained there.
  const everyReason: Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], true> = {
    no_such_step: true, already_so: true, no_such_position: true, run_by_the_loop: true, no_step_before_it: true, over_not_before: true, not_a_kept_step: true,
    did_not_work: true, already_in_flow: true, already_out: true
  };

  it("can say every reason the draft computes, with what the word means", () => {
    for (const reason of Object.keys(everyReason) as AutomationStudioFlowDraftAmendmentRefusal["reason"][]) {
      const feedback = built([{ step: 2, reason }]);
      expect(feedback.refused).toEqual([{ step: 2, reason }]);
      const explanation = (feedback.reasons as Record<string, string>)[reason];
      expect(typeof explanation).toBe("string");
      expect(explanation!.length).toBeGreaterThan(20);
    }
  });

  it("explains each distinct reason once, however many amendments met it", () => {
    const feedback = built([
      { step: 7, reason: "no_such_step" },
      { step: 8, reason: "no_such_step" },
      { step: 2, reason: "already_so" }
    ]);
    expect(Object.keys(feedback.reasons as Record<string, string>)).toEqual(["no_such_step", "already_so"]);
    expect(feedback.refused).toHaveLength(3);
  });

  it("lists the positions that do exist only when one that does not was named", () => {
    expect(built([{ step: 9, reason: "no_such_step" }]).positions).toEqual([1, 2, 3]);
    expect(built([{ step: 2, reason: "already_so" }]).positions).toBeUndefined();
  });

  // Positions are read off the draft rather than assumed from its length, and
  // the newest are the ones an edit is usually about.
  it("reads the positions off the draft, and keeps the newest of a long one", () => {
    const long = Array.from({ length: 40 }, (_unused, index) => ({ position: index + 1 }));
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 99, reason: "no_such_step" }], applied: 0, steps: long, stepsWithoutProgress: 2, maxStepsWithoutProgress: 8
    });
    expect(feedback.steps).toBe(40);
    expect(feedback.positions).toHaveLength(32);
    expect((feedback.positions as number[])[31]).toBe(40);
  });

  it("carries codes, Core's own sentences and integers, and stays well under two kilobytes", () => {
    const feedback = built(Array.from({ length: 16 }, (_unused, index) => ({ step: index + 40, reason: "no_such_step" as const })));
    expect(feedback.refused).toHaveLength(16);
    expect(Buffer.byteLength(JSON.stringify(feedback), "utf8")).toBeLessThan(2_048);
  });

  it("lists no more refusals than one decision may carry", () => {
    const feedback = built(Array.from({ length: 20 }, (_unused, index) => ({ step: index + 40, reason: "no_such_step" as const })));
    expect(feedback.refused).toHaveLength(16);
  });
});
