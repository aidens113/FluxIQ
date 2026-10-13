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

// Round 12, lane B build 2 (`run-mv636xvb-e1426db1`, defect 4): the same Flow sent
// again read "Not done: some steps weren't written in a way the Flow can run".
describe("a submission refused as the same Flow sent again", () => {
  it("says the same Flow was sent again unchanged, with no step to fix", () => {
    const again = declined({}, ["candidate.unchanged_submission"]);
    expect(again).toMatchObject({ status: "failed", part: "Declined", unchanged: true, words: "it was the same Flow as the one already saved, sent again unchanged, so nothing new was saved" });
    expect(declined({}, ["candidate.unchanged_after_no"])?.words).toBe("it was the same Flow the check had already found doesn't do what was asked, sent again unchanged, so it wasn't saved again");
    expect(again?.words).not.toMatch(/written|to fix/u);
  });

  it("marks no other refusal unchanged", () => {
    expect(declined({}, ["flow_script.repeat_invalid"])?.unchanged).toBeUndefined();
  });
});
