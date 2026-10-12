// What a candidate build's no-progress ending carries of its last refused
// submission (t378): lanes C and D ended "it kept trying without getting any
// further" over a Flow refused for its repeat, then sent again unchanged.
import { describe, expect, it } from "vitest";
import { flowBootstrapDiagnosticIssueCodes } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace } from "../../../llm/index.ts";
import { automationStudioCandidateRefusalCodes, automationStudioCandidateSubmissionRefusals } from "../index.ts";

const ran = (evidence: Record<string, unknown>) => ({ kind: "llm_evidence_tool_execution" as const, evidence, effectApplied: false });
const refused = ran({ ok: false, revision: 1, diagnostics: { code: "flow_bootstrap.completion_refused", refusal: "flow_bootstrap.evidence_completion_plan_invalid", issues: [
  { code: "flow_script.repeat_body_is_routed", path: "flow.line.22", message: "The step at line 23 says repeat inside the span" },
  { code: "web.handle.unknown_field:extractList.fields.0", path: "plan.subflows.0.nodes.13.parameters", message: "" }
] }, issueCodes: ["flow_script.repeat_body_is_routed"] });
const row = (iteration: number, resultCode: string): AutomationStudioLlmEvidenceLoopTrace => ({ iteration, decision: "tool_call", toolId: "core.submit_candidate", resultCode });

type Decision = Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["decide"]>>;
type ToolResult = Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>;

function loop(results: unknown[]): AutomationStudioLlmEvidenceLoopInput {
  return { tools: [], decide: async () => ({ kind: "complete", result: {} }) as Decision, executeTool: async () => results.shift() as ToolResult };
}

describe("a candidate build's last refused submission", () => {
  it("is carried as codes a diagnostic keeps, and read back whole", async () => {
    const watch = automationStudioCandidateSubmissionRefusals();
    const observed = watch.observe(loop([refused]));
    await expect(observed.executeTool({ callId: "submit-1", toolId: "core.submit_candidate", value: {} })).resolves.toBe(refused);
    const codes = watch.codes({ trace: [row(1, "flow_bootstrap.evidence_completion_plan_invalid"), row(2, "llm_evidence_loop.repeat_refused"), row(3, "llm_evidence_loop.repeat_refused"), row(4, "llm_evidence_loop.repeat_refused")] });
    // Every code survives the diagnostic's own screen, in order.
    expect(flowBootstrapDiagnosticIssueCodes(codes)).toEqual(codes);
    expect(automationStudioCandidateRefusalCodes.decode([...codes, "llm_evidence_loop.repeat_refused"])).toEqual({
      refusals: 1, sentAgain: 3, family: "flow_bootstrap.evidence_completion_plan_invalid",
      issues: [{ code: "flow_script.repeat_body_is_routed", path: "flow.line.22" }, { code: "web.handle.unknown_field", path: "plan.subflows.0.nodes.13.parameters" }]
    });
    expect(JSON.stringify(codes)).not.toContain("span");
  });

  it("counts refusals in a row, starts again after one is accepted, and carries nothing once the last was accepted", async () => {
    const watch = automationStudioCandidateSubmissionRefusals();
    const observed = watch.observe(loop([refused, refused, ran({ ok: true }), refused, refused]));
    const submit = () => observed.executeTool({ callId: "s", toolId: "core.submit_candidate", value: {} });
    await submit(); await submit(); await submit();
    expect(watch.codes({ trace: [] })).toEqual([]);
    await submit(); await submit();
    expect(automationStudioCandidateRefusalCodes.decode(watch.codes({ trace: [] }))?.refusals).toBe(2);
  });

  it("reads a line, when an issue carries one, and nothing from codes that carry no refusal", () => {
    const codes = automationStudioCandidateRefusalCodes.encode({ refusals: 1, sentAgain: 0, issues: [{ code: "web.step.consequences_undeclared", line: 12, path: "plan.subflows.0.nodes.2" }] });
    expect(automationStudioCandidateRefusalCodes.decode(codes)).toEqual({ refusals: 1, sentAgain: 0, issues: [{ code: "web.step.consequences_undeclared", line: 12 }] });
    expect(automationStudioCandidateRefusalCodes.decode(["llm_evidence_loop.repeat_refused"])).toBeUndefined();
    expect(automationStudioCandidateRefusalCodes.encode({ refusals: 0, sentAgain: 2, issues: [] })).toEqual([]);
  });
});
