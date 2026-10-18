// A key beside a tool call's input, and a reply whose brackets were miscounted
// (run-mvcwp3wh-bcea2115).
//
// Every plan the supervisor sent put an input key beside `input`: ten replies
// lost count of their closers and could not be read, and the two that were
// read were refused `llm_output.unexpected_field` with no path. A key the
// tool's schema declares is now moved (`../../../harness/tool-call-keys/`);
// these pin what the model is told about every other key, and what an
// unreadable reply of the bracket cases is told about how a tool call nests
// (`../../../unusable-decision.ts`). Through the real harness where a reply is
// involved; Core's closed words only, never a provider key.

import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness } from "../../../harness.ts";
import {
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmUnusableDecisionFeedback,
  type AutomationStudioLlmUnusableDecisionFieldIssue
} from "../../../unusable-decision.ts";
import { automationStudioLlmUnusableDecisionError, buildAutomationStudioLlmEvidenceLoopDecisionSchema, type AutomationStudioLlmTaskResult } from "../../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const look = { kind: "tool_call", callId: "call.look", toolId: "inspect", input: { area: "a1" } };

const writeIssue: AutomationStudioLlmUnusableDecisionFieldIssue = { code: "llm_output.unexpected_field", path: "response.decision.write", expectedPath: "response.decision.input.write" };
const besideInputIssue: AutomationStudioLlmUnusableDecisionFieldIssue = { code: "llm_output.unexpected_field", path: "response.decision", expectedPath: "response.decision.input" };
const holdsOnly = "A tool call holds only kind, callId, toolId and input";

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

describe("a key beside a tool call's input that its tool does not declare", () => {
  it("is named by the closed input correction, and the model is told where every other key goes", async () => {
    const error = automationStudioLlmUnusableDecisionError(await schemaDecision({ ...look, PRIVATE_FIELD_NAME: "PRIVATE_FIELD_VALUE" }))!;
    expect(error.fieldIssues).toEqual([besideInputIssue]);
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: error.issueCodes, fieldIssues: error.fieldIssues!, stepsWithoutProgress: 1, maxStepsWithoutProgress: 3 });
    expect(feedback.fieldIssues).toEqual([besideInputIssue]);
    expect(feedback.instruction).toContain(holdsOnly);
    expect(feedback.instruction).toContain("every other key goes inside response.decision.input, where the tool's input schema declares it");
    expect(JSON.stringify({ error, feedback })).not.toMatch(/PRIVATE_FIELD_NAME|PRIVATE_FIELD_VALUE/);
  });

  it("is named beside write's own correction when both were written beside input", async () => {
    const error = automationStudioLlmUnusableDecisionError(await schemaDecision({ ...look, write: true, notes: "x" }))!;
    expect(error.fieldIssues).toEqual([writeIssue, besideInputIssue]);
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: error.issueCodes, fieldIssues: error.fieldIssues!, stepsWithoutProgress: 1, maxStepsWithoutProgress: 3 });
    expect(feedback.instruction).toContain("response.decision.input.write");
    expect(feedback.instruction).toContain(holdsOnly);
  });

  it("gives write alone its correction, unchanged", async () => {
    const error = automationStudioLlmUnusableDecisionError(await schemaDecision({ ...look, write: true }))!;
    expect(error.fieldIssues).toEqual([writeIssue]);
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: error.issueCodes, fieldIssues: error.fieldIssues!, stepsWithoutProgress: 1, maxStepsWithoutProgress: 3 });
    expect(feedback.instruction).not.toContain(holdsOnly);
  });

  it("gives no input correction to an unexpected key of a decision that is not a tool call", async () => {
    const result = await schemaDecision({ kind: "complete", result: { done: true }, notes: "x" });
    expect(result.ok).toBe(false);
    expect(automationStudioLlmUnusableDecisionError(result)!.fieldIssues).toBeUndefined();
  });

  it("does not take a caller's correction that sends the key anywhere else", () => {
    const forged: AutomationStudioLlmUnusableDecisionFieldIssue = JSON.parse(JSON.stringify({ ...besideInputIssue, expectedPath: "response.decision.PRIVATE_FIELD_NAME" }));
    expect(new AutomationStudioLlmUnusableDecisionError(["llm_output.unexpected_field"], undefined, [forged]).fieldIssues).toBeUndefined();
    expect(new AutomationStudioLlmUnusableDecisionError(["llm_output.unexpected_field"], undefined, [besideInputIssue]).fieldIssues).toEqual([besideInputIssue]);
  });
});

describe("an unreadable reply whose brackets were miscounted", () => {
  const nesting = "A tool call is {kind, callId, toolId, input: {...}}: every key of the tool's input goes inside input, and input closes before the decision does.";
  const told = (replyCase: "content_mismatched" | "content_unclosed" | "content_fenced", offers?: { tools: boolean; complete: boolean; amend: boolean }) => String(automationStudioLlmUnusableDecisionFeedback({
    issueCodes: ["llm.provider_malformed_response"], stepsWithoutProgress: 0, maxStepsWithoutProgress: 3,
    ...(offers ? { offers } : {}), unreadable: { reply: { case: replyCase }, inARow: 1, maxInARow: 6 }
  }).instruction);

  it("is told how a tool call nests, for a reply whose brackets did not match or never closed", () => {
    expect(told("content_mismatched")).toContain(nesting);
    expect(told("content_unclosed")).toContain(nesting);
    expect(told("content_mismatched", { tools: true, complete: false, amend: false })).toContain(nesting);
  });

  it("is not told it for another case, or where no tool call was offered", () => {
    expect(told("content_fenced")).not.toContain(nesting);
    expect(told("content_mismatched", { tools: false, complete: true, amend: false })).not.toContain(nesting);
  });
});
