// A decision whose kind names no known kind (t445).
//
// R4: every one of the 9 refused decisions in 81 logged runs (2,728
// decisions) wrote the key name `callId` as the decision's kind, 6 of them
// with no callId at all, and each named an offered tool with a valid input.
// Such a decision can only be a tool call, so the harness reads it as one with
// a warning (`../../../harness/provider-result.ts`), and the loop then checks it as
// any tool call; what stays refused is told which field was at fault
// (`../../../unusable-decision.ts`). These run through the real harness and loop.

import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmHarness } from "../../../harness.ts";
import { automationStudioLlmUnusableDecisionFeedback, type AutomationStudioLlmUnusableDecisionFieldIssue } from "../../../unusable-decision.ts";
import {
  automationStudioLlmUnusableDecisionError,
  buildAutomationStudioLlmEvidenceLoopDecisionSchema,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmTaskResult
} from "../../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };

/** A decision as the provider sent it, through the harness's checks against the loop's real decision schema. */
function schemaDecision(decision: unknown): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({
    taskKind: "evidence_tool_decision", projectId: "project.grammar", flowId: "flow.grammar", instructions: [],
    deniedEvidenceKeys: [], evidenceLoop: { tools, evidence: [], iteration: 1,
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }), completionSchema: { type: "object" }, canComplete: true },
    tokenLimits: { maxInputTokens: 100_000, maxOutputTokens: 2_000, maxTotalTokens: 102_000 },
    provider: { metadata: { provider: "fixture", model: "fixture" }, runTask: async () => ({
      response: { kind: "evidence_tool_decision", summary: "Grammar fixture", decision }
    }) }
  });
}

describe("a decision whose kind names no known kind", () => {
  const kindIssue: AutomationStudioLlmUnusableDecisionFieldIssue = { code: "llm_output.invalid_evidence_decision", path: "response.decision.kind", allowed: ["tool_call", "complete", "amend_draft"] };

  it("is read as the tool call it can only be, with a warning, and runs through the loop's own checks", async () => {
    const host = vi.fn(async () => ({ seen: true }));
    for (const decision of [
      { kind: "callId", callId: "select-7in1", toolId: "inspect", input: { area: "options" } },
      { kind: "callId", toolId: "inspect", input: { area: "options" } }
    ]) {
      const read = await schemaDecision(decision);
      expect(read.ok).toBe(true);
      expect(read.diagnostics).toContainEqual(expect.objectContaining({ severity: "warning", code: "llm_output.decision_kind_inferred", path: "response.decision.kind" }));
      expect(read.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      const result = await runAutomationStudioLlmEvidenceLoop({
        tools, executeTool: host,
        decide: vi.fn().mockResolvedValueOnce((read.response as { decision: unknown }).decision).mockResolvedValueOnce(complete)
      });
      expect(result.ok).toBe(true);
      expect(result.trace[0]).toMatchObject({ decision: "tool_call", toolId: "inspect" });
    }
    expect(host).toHaveBeenCalledTimes(2);
  });

  it("is still refused by the loop when the tool it names was not offered", async () => {
    const read = await schemaDecision({ kind: "callId", toolId: "not.offered", input: { area: "options" } });
    expect(read.ok).toBe(true);
    const host = vi.fn(async () => ({}));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, executeTool: host, decide: vi.fn().mockResolvedValueOnce((read.response as { decision: unknown }).decision).mockResolvedValue(complete)
    });
    expect(host).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.unknown_tool" });
  });

  it("stays refused where the shape is ambiguous, and the feedback names decision.kind and its allowed values", async () => {
    const result = await schemaDecision({ kind: "callId", toolId: "inspect", input: { area: "options" }, result: { done: true } });
    expect(result.ok).toBe(false);
    expect(result.response).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "llm_output.invalid_evidence_decision", path: "response.decision.kind" }));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.decision_kind_inferred");
    const error = automationStudioLlmUnusableDecisionError(result)!;
    expect(error.fieldIssues).toEqual([kindIssue]);
    const feedback = automationStudioLlmUnusableDecisionFeedback({
      issueCodes: error.issueCodes, ...(error.fieldIssues ? { fieldIssues: error.fieldIssues } : {}), stepsWithoutProgress: 1, maxStepsWithoutProgress: 3
    });
    expect(feedback.fieldIssues).toEqual([kindIssue]);
    expect(feedback.instruction).toContain("response.decision.kind");
    expect(feedback.instruction).toContain("\"tool_call\", \"complete\" or \"amend_draft\"");
  });

  it("names no field where the decision was not an object, and withholds a forged kind correction", async () => {
    const result = await schemaDecision("callId");
    const error = automationStudioLlmUnusableDecisionError(result)!;
    expect(error.issueCodes).toContain("llm_output.invalid_evidence_decision");
    expect(error.fieldIssues).toBeUndefined();
    // As a hostile caller would hand it over: parsed, so no type vouches for it.
    const forged = JSON.parse(JSON.stringify({ ...kindIssue, allowed: ["PRIVATE_KIND"], note: "PRIVATE_NOTE" }));
    const feedback = automationStudioLlmUnusableDecisionFeedback({
      issueCodes: ["llm_output.invalid_evidence_decision"], fieldIssues: [forged], stepsWithoutProgress: 1, maxStepsWithoutProgress: 3
    });
    expect(feedback.fieldIssues).toEqual([kindIssue]);
    expect(JSON.stringify(feedback)).not.toMatch(/PRIVATE_KIND|PRIVATE_NOTE/);
    expect(automationStudioLlmUnusableDecisionFeedback({
      issueCodes: ["llm_output.invalid_summary"], fieldIssues: [kindIssue], stepsWithoutProgress: 1, maxStepsWithoutProgress: 3
    }).fieldIssues).toBeUndefined();
  });
});
