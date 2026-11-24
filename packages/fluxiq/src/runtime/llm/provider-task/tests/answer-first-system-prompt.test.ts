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

  // t1008 (run-mwufisf0-5535f5f5): told to prefer looking and never to act only to see more, a live
  // exploration described and searched for ninety calls and never pressed the control that opened what it needed.
  it("leaves a build's restraint on acting out of the exploration's decisions, and only there", () => {
    const restraint = ["prefer observation over mutation", "Use a mutating tool only when its state change is necessary", "Do not call a mutating tool merely to unlock another observation"];
    const decision = { taskKind: "evidence_tool_decision" };
    const exploration = automationStudioLlmTaskSystemPrompt(request({ ...decision, domainInstructions: { domainId: "fluxiq.answer-first", text: "Role." } }));
    for (const words of restraint) {
      expect(AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION).toContain(words);
      expect(exploration).not.toContain(words);
      expect(automationStudioLlmTaskSystemPrompt(request(decision))).toContain(words);
      expect(automationStudioLlmTaskSystemPrompt(request({ ...decision, domainInstructions: { domainId: "web", text: "Domain." } }))).toContain(words);
    }
    // The rest of Core's rules still hold for the exploration.
    expect(exploration).toContain("Do not select a tool merely because one remains available.");
    expect(exploration).toContain("Never mutate merely to perform an eventual workflow step");
    expect(exploration).toContain("Repeating an observation with different parameters is not progress.");
  });

  it("conditions automatic processing guidance and preserves action filtering in emitted decisions", () => {
    for (const domainInstructions of [undefined, { domainId: "fluxiq.answer-first", text: "Role." }]) {
      const prompt = automationStudioLlmTaskSystemPrompt(request({ taskKind: "evidence_tool_decision", ...(domainInstructions ? { domainInstructions } : {}) }));
      expect(prompt).toContain("With declared automatic task processing");
      expect(prompt).toContain("Without automatic processing");
      expect(prompt).toContain("Explicit exclusions remain authoritative");
      expect(prompt).toContain("Rows a later step acts on are still narrowed by the read's where");
      expect(prompt).not.toContain("do not read every page while exploring");
    }
  });

  it("tells the attempt's judge nothing of a Flow's shape, and every other judge what it always was", () => {
    const judge = { taskKind: "loop_verification" };
    expect(automationStudioLlmTaskSystemPrompt(request({ ...judge, metadata: { source: "answerFirstJudge" } }))).not.toContain("flowShape");
    expect(automationStudioLlmTaskSystemPrompt(request(judge))).toContain("flowShape");
  });
});
