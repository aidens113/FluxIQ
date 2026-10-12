// A refused submission counts steps, not issues, and says each issue's own
// reason (t378, lane B: "4 things to fix" was two steps, and a search step that
// sent its form read "some steps point at things that weren't seen").
import { describe, expect, it } from "vitest";
import { automationStudioActivityCandidateResult } from "../index.ts";

const declined = (diagnostics: Record<string, unknown>, issueCodes: string[]) =>
  automationStudioActivityCandidateResult("core.submit_candidate", { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, revision: 3, diagnostics, issueCodes } });

describe("a refused submission", () => {
  it("counts the distinct steps its issues name", () => {
    const issues = [2, 2, 5, 5].map((node, index) => ({ code: index % 2 ? "web.step.expected.consequences_classes_or_none" : "web.step.consequences_undeclared", path: `plan.subflows.0.nodes.${node}.parameters` }));
    expect(declined({ refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", issues }, issues.map((issue) => issue.code))?.words)
      .toBe("some steps that press or send something didn't say what doing that does; 2 steps to fix");
  });

  it("counts script lines as steps once the issues carry them", () => {
    const issues = [{ code: "flow_script.repeat_body_is_routed", path: "flow.line.22", line: 23 }, { code: "flow_script.repeat_invalid", path: "flow.line.27", line: 23 }];
    expect(declined({ refusal: "flow_bootstrap.evidence_completion_plan_invalid", issues }, issues.map((issue) => issue.code))?.words)
      .toBe("a repeat was written where the Flow can't run it");
  });
});
