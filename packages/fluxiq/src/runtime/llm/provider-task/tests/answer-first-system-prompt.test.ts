// The prompt the answer-first exploration and its judge really get (t861): the exploration is not told
// a build's goal, and the judge is told nothing of a Flow. Every other request is as it was.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION } from "../../evidence-loop-decision.ts";
import { automationStudioLlmTaskSystemPrompt } from "../system-prompt.ts";
import type { AutomationStudioLlmTaskRequest } from "../../index.ts";

const GOAL = "Your goal is to produce the final structured result, not to execute the workflow that result describes.";
const request = (fields: Record<string, unknown>) => ({ context: {}, ...fields }) as unknown as AutomationStudioLlmTaskRequest;

describe("the answer-first system prompt", () => {
  it("still finds the sentence it leaves out in Core's text", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION).toContain(GOAL);
  });

  it("leaves a build's goal out of the exploration's decisions, and only there", () => {
    const decision = { taskKind: "evidence_tool_decision" };
    expect(automationStudioLlmTaskSystemPrompt(request({ ...decision, domainInstructions: { domainId: "fluxiq.answer-first", text: "Role." } }))).not.toContain(GOAL);
    expect(automationStudioLlmTaskSystemPrompt(request(decision))).toContain(GOAL);
    expect(automationStudioLlmTaskSystemPrompt(request({ ...decision, domainInstructions: { domainId: "web", text: "Domain." } }))).toContain(GOAL);
  });

  it("tells the attempt's judge nothing of a Flow's shape, and every other judge what it always was", () => {
    const judge = { taskKind: "loop_verification" };
    expect(automationStudioLlmTaskSystemPrompt(request({ ...judge, metadata: { source: "answerFirstJudge" } }))).not.toContain("flowShape");
    expect(automationStudioLlmTaskSystemPrompt(request(judge))).toContain("flowShape");
  });
});
