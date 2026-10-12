// The last decision, offered only completion and spent on a call, leaves its
// row: it was paid for like every other (t214).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceFinalDecisionRow } from "../index.ts";

describe("the row a last decision leaves when it asked for a call it was not offered", () => {
  it("retains a paid offered call stopped by the actual deadline", () => {
    expect(automationStudioLlmEvidenceFinalDecisionRow(2, { toolId: "core.test_candidate", usage: { totalTokens: 80 } },
      new Set(["core.test_candidate"]), "llm_evidence_loop.duration_limit")).toEqual({
      iteration: 2, decision: "tool_call", toolId: "core.test_candidate", resultCode: "llm_evidence_loop.duration_limit", usage: { totalTokens: 80 }
    });
  });

  it("names the tool the loop has, and carries what the decision cost", () => {
    expect(automationStudioLlmEvidenceFinalDecisionRow(20, { toolId: "demo.look", usage: { outputTokens: 150 } }, new Set(["demo.look"]))).toEqual({
      iteration: 20, decision: "tool_call", toolId: "demo.look", resultCode: "llm_evidence_loop.not_offered", usage: { outputTokens: 150 }
    });
  });

  it("records a tool the model made up as the unusable decision it was, naming nothing", () => {
    expect(automationStudioLlmEvidenceFinalDecisionRow(7, { toolId: "made up tool" }, new Set(["demo.look"]))).toEqual({
      iteration: 7, decision: "unusable", resultCode: "llm_evidence_loop.not_offered"
    });
  });
});
