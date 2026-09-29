// The content-free progress record a loop publishes for each row. These tests
// keep the diagnostic identity tied to real draft transitions, state digests,
// and completion checks without exposing any tool input or provider result.

import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const pressed = (index: number) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "press", input: { target: `target.${index}` } });
const completed = { kind: "complete", result: { flow: "ready" } };
const stalled = () => new Error("stalled");

describe("evidence-loop draft progress", () => {
  it("records exact revisions, stable ids, edit counts, rerun replacement, and the draft shown", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "reorder", to: 2 }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { target: "target.2b" } }] })
      .mockResolvedValueOnce(completed);
    const executeTool = vi.fn().mockResolvedValue({
      kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true,
      draft: { actionId: "web.dom.click", proposes: true }
    });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [press], decide, executeTool, maxIterations: 8, maxToolCalls: 8,
      unusableDecisions: { stalled }
    });

    expect(result.ok).toBe(true);
    expect(result.trace.map((row) => [row.progress?.draftRevisionBefore, row.progress?.draftRevisionAfter])).toEqual([
      [0, 1], [1, 2], [2, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 6]
    ]);
    expect(result.trace.map((row) => row.progress?.draftState)).toEqual([
      "changed", "changed", "unchanged", "changed", "changed", "changed", "changed", "unchanged"
    ]);
    expect(result.trace[2]).toMatchObject({
      resultCode: "llm_evidence_loop.draft_unchanged",
      draftChange: { targetedStepIds: ["d1"], appliedCount: 0, refusedCount: 1, keptStepCount: 2 }
    });
    expect(result.trace[3]).toMatchObject({
      resultCode: "llm_evidence_loop.draft_amended",
      draftChange: { targetedStepIds: ["d1"], appliedCount: 1, refusedCount: 0, keptStepCount: 2 }
    });
    expect(result.trace[4]).toMatchObject({
      resultCode: "llm_evidence_loop.draft_amended",
      draftChange: { targetedStepIds: ["d2"], appliedCount: 1, refusedCount: 0, keptStepCount: 1 }
    });
    // The step a rerun replaces is still kept when the amendment is recorded:
    // it is withdrawn only once the rerun has worked, which the final draft shows.
    expect(result.trace[5]).toMatchObject({
      resultCode: "llm_evidence_loop.draft_rerun",
      draftChange: { targetedStepIds: ["d1"], appliedCount: 1, refusedCount: 0, keptStepCount: 1, rerunStepId: "d1" }
    });
    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([
      // Reordering changes position, never identity.
      ["d2", "dropped"], ["d1", "dropped"], ["d3", "kept"]
    ]);
    // A row says what its decision was shown before that row changed the
    // draft. The count includes withdrawn steps, whose dispositions and ids
    // remain visible so later positions can be understood.
    expect(result.trace.map((row) => row.draft?.steps)).toEqual([undefined, 1, 2, 2, 2, 2, 2, 3]);
  });

  it("counts a refused action that the next decision can see as one draft revision", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(completed);

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [press], decide,
      executeTool: async () => ({
        kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false,
        resultCode: "web.action.rejected.target_unobserved"
      })
    });

    expect(result.ok).toBe(true);
    expect(result.trace[0]?.progress).toEqual({
      draftRevisionBefore: 0, draftRevisionAfter: 1, pageState: "unobserved",
      draftState: "changed", answerabilityState: "unobserved"
    });
    expect(result.trace[1]?.progress).toMatchObject({ draftRevisionBefore: 1, draftRevisionAfter: 1, draftState: "unchanged" });
    expect(result.trace[1]?.draft).toMatchObject({ steps: 1 });
    expect(result.steps[0]).toMatchObject({ id: "d1", effectApplied: false, resultCode: "web.action.rejected.target_unobserved" });
  });
});

describe("evidence-loop page-state progress", () => {
  it("maps equal, different, and missing digest pairs without inferring from action success", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(pressed(3))
      .mockResolvedValueOnce(completed);
    const digests = ["same", "same", "before", "after", undefined, "observed"];

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [press], decide, draft: false,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true }),
      captureStateDigest: vi.fn(() => digests.shift())
    });

    expect(result.ok).toBe(true);
    expect(result.trace.map((row) => row.progress?.pageState)).toEqual([
      "unchanged", "changed", "unobserved", "unobserved"
    ]);
    expect(result.trace.every((row) => row.progress?.draftRevisionBefore === 0 && row.progress.draftRevisionAfter === 0)).toBe(true);
  });

  it.each([
    ["equal", ["same", "same"], "unchanged"],
    ["different", ["before", "after"], "changed"],
    ["missing", [undefined, "after"], "unobserved"]
  ] as const)("maps %s digests around the iteration-zero initial observation", async (_name, digests, expected) => {
    const pending = [...digests];
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "inspect", description: "Inspect the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      decide: async () => completed,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false }),
      captureStateDigest: () => pending.shift(),
      draft: false
    });

    expect(result.ok).toBe(true);
    expect(result.trace[0]).toMatchObject({
      iteration: 0,
      progress: { draftRevisionBefore: 0, draftRevisionAfter: 0, pageState: expected, draftState: "unchanged", answerabilityState: "unobserved" }
    });
  });
});

describe("evidence-loop answerability progress", () => {
  it("distinguishes the first, repeated, and changed capability snapshots", async () => {
    const cannotAnswer = {
      recordsRequested: true, recordProducerPresent: false, recordStorePresent: false,
      issueCode: "bootstrap.cannot_answer_instruction" as const
    };
    const canAnswer = { recordsRequested: true, recordProducerPresent: true, recordStorePresent: false };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 1 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 3 } });
    let checked = 0;

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [press], decide,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false }),
      checkCompletion: () => {
        checked += 1;
        return checked < 3
          ? { ok: false, issueCodes: ["bootstrap.cannot_answer_instruction"], feedback: { issue: "cannot_answer" }, answerability: cannotAnswer }
          : { ok: true, answerability: canAnswer };
      },
      unusableDecisions: { maxConsecutive: 3, stalled }
    });

    expect(result.ok).toBe(true);
    expect(result.trace.map((row) => row.progress?.answerabilityState)).toEqual([
      "first_observed", "unchanged", "changed"
    ]);
    expect(result.trace.map((row) => row.answerability)).toEqual([cannotAnswer, cannotAnswer, canAnswer]);
    expect(result.trace.every((row) => row.progress?.pageState === "unobserved")).toBe(true);
  });
});
