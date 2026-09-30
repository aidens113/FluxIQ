// What a continued build's first decision is told about the build it
// continues: codes, counts and Core's own words, never page content.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, automationStudioLlmEvidenceResumeEntry } from "../resume.ts";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `t.${position}` }, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("the entry a continued build starts from", () => {
  it("names the revision, why the last build stopped, what it still owes, and the draft it proved", () => {
    const entry = automationStudioLlmEvidenceResumeEntry(
      { revision: 2, stopped: "budget", outstandingIssueCodes: ["bootstrap.cannot_answer_instruction", "dry_run.step_failed"] },
      [step(1), step(2), step(3, { effectApplied: false }), step(4, { effect: "observe" }), step(5, { disposition: "dropped" })]
    );

    expect(entry).toEqual({
      callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`,
      toolId: "core.resumed",
      value: {
        code: "llm_evidence_loop.resumed",
        revision: 2,
        stopped: "budget",
        draftSteps: 5,
        // Kept, of the kind a result is made of, and not a failed attempt.
        proposableSteps: 2,
        outstanding: ["bootstrap.cannot_answer_instruction", "dry_run.step_failed"],
        instruction: expect.stringContaining("continues one that ran out of decisions")
      }
    });
  });

  it("carries a stop for unusable decisions as it was given", () => {
    expect(automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "unusable_decisions", outstandingIssueCodes: [] }, []).value)
      .toMatchObject({ stopped: "unusable_decisions", draftSteps: 0, proposableSteps: 0, outstanding: [] });
  });

  it("counts a revision that is not a positive whole number as the first", () => {
    for (const revision of [0, -3, 1.5, Number.NaN]) {
      expect(automationStudioLlmEvidenceResumeEntry({ revision, stopped: "iterations", outstandingIssueCodes: [] }, []).value.revision).toBe(1);
    }
  });

  it("keeps only issue codes that are codes, and every one of them", () => {
    const codes = ["ok.code", "has spaces", "<script>", "x".repeat(101), ...Array.from({ length: 20 }, (_, index) => `code.${index}`)];
    const outstanding = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "tool_calls", outstandingIssueCodes: codes }, []).value.outstanding as string[];

    // No count limit: all twenty-one codes, and none of the three that are not codes.
    expect(outstanding).toHaveLength(21);
    expect(outstanding[0]).toBe("ok.code");
    expect(outstanding).not.toContain("has spaces");
    expect(outstanding).not.toContain("<script>");
    expect(outstanding.every((code) => code.length <= 100)).toBe(true);
  });
});

// A continuation is still the build's live phase (user, 2026-09-30): its
// draft is not replayed from the first step before the model decides. It used
// to be, to put the page where the draft left it.
describe("a continued build", () => {
  it("replays nothing before its first decision, and is told the page is where it stands", async () => {
    const replayable = (position: number): AutomationStudioFlowDraftStep => step(position, { id: `s${position}`, toolId: "press", ranWith: { target: `t.${position}` }, proposes: true, replay: { from: { location: "https://store.test/start" } } });
    const executeTool = vi.fn(async (): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" }));
    const decide = vi.fn().mockResolvedValue({ kind: "recorded_run_ended" });
    await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" }],
      decide, executeTool, maxIterations: 1, maxToolCalls: 1,
      unusableDecisions: { maxConsecutive: 1, stalled: () => new Error("stalled") },
      draft: { seed: [replayable(1), replayable(2)], resume: { revision: 1, stopped: "iterations", outstandingIssueCodes: [] } }
    });
    expect(executeTool).not.toHaveBeenCalled();
    const shown = (decide.mock.calls[0]![0] as { evidence: { toolId: string; value: { instruction?: string } }[] }).evidence;
    const resumed = shown.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID)!;
    expect(resumed.value.instruction).toContain("They were not run again");
  });
});
