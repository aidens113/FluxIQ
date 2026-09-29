// What a continued build's first decision is told about the build it
// continues: codes, counts and Core's own words, never page content.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
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

  it("keeps only issue codes that are codes, and at most sixteen of them", () => {
    const codes = ["ok.code", "has spaces", "<script>", "x".repeat(101), ...Array.from({ length: 20 }, (_, index) => `code.${index}`)];
    const outstanding = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "tool_calls", outstandingIssueCodes: codes }, []).value.outstanding as string[];

    expect(outstanding).toHaveLength(16);
    expect(outstanding[0]).toBe("ok.code");
    expect(outstanding).not.toContain("has spaces");
    expect(outstanding).not.toContain("<script>");
    expect(outstanding.every((code) => code.length <= 100)).toBe(true);
  });
});
