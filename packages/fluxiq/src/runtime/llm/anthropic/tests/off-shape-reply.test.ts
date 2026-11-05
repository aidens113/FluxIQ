// A reply that is sound JSON and does not fit what was asked, on the path where only Core holds it to the schema. The two
// that open this are paid run `run-mw3itjcy-ce4429f7`'s steps 67 and 74, key for key, with made-up words: each cost a call.
import { describe, expect, it, vi } from "vitest";
import { automationStudioAnthropicMatchesSchema, automationStudioAnthropicSchemaMisses, automationStudioAnthropicReplyOwnWord } from "../../../models/providers/anthropic/index.ts";
import { automationStudioLlmProviderReplyAccount } from "../../../models/failures/index.ts";
import { automationStudioLlmEvidenceParseDecision, buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { parseAutomationStudioLlmProviderResult, type AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmTaskOutputSchema } from "../../provider-task/index.ts";
import { automationStudioLlmUnusableDecisionFeedback } from "../../unusable-decision.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { automationStudioAnthropicTaskAnswer } from "../task-answer.ts";
import { decisionRequest, request, streamReply } from "./fixtures.ts";

const SUMMARY = "Two presses were wrong (the bowl and the jug, not among those asked for); I'm dropping them from the Flow and will next press the right ones, then ask you about the wrong ones.";
const STEP_67 = { kind: "amend_draft", summary: SUMMARY, decision: { kind: "amend_draft", amendments: [{ step: 20, change: "drop" }, { step: 21, change: "drop" }, { step: 22, change: "drop" }, { step: 24, change: "drop" }, { step: 25, change: "drop" }] } };
const OBSERVED = "Three presses landed and the count went from 2 to 5. ".repeat(11).slice(0, 574).concat(".");
const STEP_74 = {
  kind: "diagnosis",
  diagnosis: { expected: "Keep the three cheapest mugs within five miles, then list everything kept.", observed: OBSERVED, changed: "Three kept items were added.", answersRequest: "yes", defects: [], explorationNeeded: false, patchNeeded: false },
  confidence: 0.8,
  summary: "The request is met: the three cheapest were kept and the list shows them."
};
const USAGE = { inputTokens: 100, outputTokens: 30, totalTokens: 130 };

const provider = (text: string) => createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: vi.fn(async () => streamReply(text, "end_turn")) });
const envelope = (value: unknown) => JSON.stringify({ result_json: JSON.stringify(value) });

/** A decision the loop could amend on, as paid step 67's was offered. */
function amendingRequest(): AutomationStudioLlmTaskRequest {
  const base = decisionRequest();
  const loop = base.context.evidenceLoop!;
  return { ...base, context: { ...base.context, evidenceLoop: { ...loop, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(loop.tools, loop.completionSchema, false, true) } } };
}
const verification = () => request({ taskKind: "loop_verification" });
const failureOf = async (run: Promise<unknown>) => run.then(() => undefined, (error: unknown) => error as { code: string; reply?: { case?: string; misses?: Array<{ path: string; rule: string }>; contentChars?: number; finishReason?: string; usage?: { outputTokens?: number } }; paid?: { outputTokens?: number } });
const thrownBy = (run: () => unknown) => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error as { code: string; reply?: { misses?: Array<{ path: string; rule: string }> } };
  }
};

describe("step 67: a sound decision under the wrong outer word", () => {
  it("is read as the real decision, billed once, and the harness takes it", async () => {
    const result = await provider(envelope(STEP_67)).runTask(amendingRequest()) as { response: { kind: string; summary: string; decision: unknown }; usage: { outputTokens: number } };
    expect(result.response).toEqual({ kind: "evidence_tool_decision", summary: SUMMARY, decision: STEP_67.decision });
    expect(result.usage.outputTokens).toBe(30);
    expect(automationStudioLlmEvidenceParseDecision(result.response.decision)).toMatchObject({ kind: "amend_draft", amendments: [{ step: 20, change: "drop" }, { step: 21, change: "drop" }, { step: 22, change: "drop" }, { step: 24, change: "drop" }, { step: 25, change: "drop" }] });
    expect(parseAutomationStudioLlmProviderResult({ response: result.response }, "evidence_tool_decision").diagnostics.filter((one) => one.severity === "error")).toEqual([]);
  });

  it("is repaired only where the word is its inner object's own and that object fits", () => {
    const schema = automationStudioLlmTaskOutputSchema(amendingRequest());
    const unchanged = (reply: unknown) => expect(automationStudioAnthropicReplyOwnWord(reply, schema)).toBe(reply);
    // A word naming another answer.
    unchanged({ kind: "diagnosis", summary: SUMMARY, decision: STEP_67.decision });
    // The right word already.
    unchanged({ kind: "evidence_tool_decision", summary: SUMMARY, decision: STEP_67.decision });
    // The word is the inner object's, and that object does not fit its place.
    unchanged({ kind: "amend_draft", summary: SUMMARY, decision: { kind: "amend_draft", amendments: [{ step: 0, change: "drop" }] } });
    // A diagnosis has no inner word to go by.
    expect(automationStudioAnthropicReplyOwnWord({ kind: "evidence_tool_decision", diagnosis: {} }, automationStudioLlmTaskOutputSchema(verification()))).toEqual({ kind: "evidence_tool_decision", diagnosis: {} });
  });

  it("still refuses a word that names another answer, and says which word it must be", async () => {
    const failure = await failureOf(provider(envelope({ kind: "diagnosis", summary: SUMMARY, decision: STEP_67.decision })).runTask(amendingRequest()));
    expect(failure?.code).toBe("llm.provider_output_invalid");
    expect(failure?.reply?.misses).toEqual([{ path: "response.kind", rule: 'must be exactly "evidence_tool_decision"' }]);
  });
});

describe("what every provider already does for a decision, now on this path too", () => {
  it("reads a long summary whole, for the chat to shorten what it shows, and writes a missing one", async () => {
    const decision = STEP_67.decision;
    const long = await provider(envelope({ kind: "evidence_tool_decision", summary: "x".repeat(241), decision })).runTask(amendingRequest()) as { response: { summary: string } };
    expect(long.response.summary).toHaveLength(241);
    const none = await provider(envelope({ kind: "evidence_tool_decision", decision })).runTask(amendingRequest()) as { response: { summary: string } };
    expect(none.response.summary).toBe("amend_draft");
  });

  it("lifts a decision that came without its wrapper", async () => {
    const result = await provider(envelope(STEP_67.decision)).runTask(amendingRequest()) as { response: unknown };
    expect(result.response).toMatchObject({ kind: "evidence_tool_decision", decision: STEP_67.decision });
  });

  it("leaves a long tool input to the tool's own check, which tells the model in its own words", () => {
    const base = amendingRequest();
    const tools = [{ toolId: "core.find", description: "Find words.", effect: "observe" as const, inputSchema: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string", minLength: 1, maxLength: 200 } } } }];
    const asked = { ...base, context: { ...base.context, evidenceLoop: { ...base.context.evidenceLoop!, tools, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }, false, false) } } };
    const call = { kind: "evidence_tool_decision", summary: "Look.", decision: { kind: "tool_call", callId: "find.one", toolId: "core.find", input: { query: "x".repeat(201) } } };
    expect(automationStudioAnthropicTaskAnswer(call, asked, USAGE, 300)).toEqual(call);
  });
});

describe("step 74: a judge's clear yes with a text past its bound", () => {
  it("the constraint it failed: diagnosis.observed, 575 characters against maxLength 500, and nothing else", () => {
    const schema = automationStudioLlmTaskOutputSchema(verification());
    expect(OBSERVED).toHaveLength(575);
    expect(automationStudioAnthropicMatchesSchema(STEP_74, schema)).toBe(false);
    expect(automationStudioAnthropicSchemaMisses(STEP_74, schema)).toEqual([{ path: "response.diagnosis.observed", rule: "must have at most 500 characters" }]);
  });

  it("is taken whole, and the harness reads it whole with a warning naming the field, as it reads every provider's", () => {
    const answer = automationStudioAnthropicTaskAnswer(STEP_74, verification(), USAGE, 1358);
    expect(answer).toEqual(STEP_74);
    const read = parseAutomationStudioLlmProviderResult({ response: answer }, "diagnosis");
    expect(read.diagnostics.filter((one) => one.severity === "error")).toEqual([]);
    expect(read.diagnostics.map((one) => one.code)).toContain("llm_output.diagnosis_text_past_bound");
    expect(read.response).toMatchObject({ kind: "diagnosis", diagnosis: { answersRequest: "yes", observed: OBSERVED } });
  });

  it.each([
    ["a blank text, which the harness drops as unanswered", { ...STEP_74, diagnosis: { ...STEP_74.diagnosis, changed: "" } }],
    ["a summary past its bound", { ...STEP_74, summary: "y".repeat(20_001) }],
    ["a defect's words past theirs", { ...STEP_74, diagnosis: { ...STEP_74.diagnosis, answersRequest: "no", defects: [{ kind: "other", row: "z".repeat(501), requestWords: "the cheapest" }] } }],
    ["thirteen defects", { ...STEP_74, diagnosis: { ...STEP_74.diagnosis, answersRequest: "no", defects: Array.from({ length: 13 }, (_, index) => ({ kind: "other", row: `row ${index}`, requestWords: "the cheapest" })) } }]
  ])("passes %s on to the harness rather than refusing the call here, and the harness reads it as a current judge's", (_name, reply) => {
    const answer = automationStudioAnthropicTaskAnswer(reply, verification(), USAGE, 1);
    expect(answer).toEqual(reply);
    expect(parseAutomationStudioLlmProviderResult({ response: answer }, "diagnosis", undefined, undefined, true).diagnostics.filter((one) => one.severity === "error")).toEqual([]);
  });

  it("still refuses what is not a matter of length, and says where", () => {
    const worded = thrownBy(() => automationStudioAnthropicTaskAnswer({ ...STEP_74, confidence: 80 }, verification(), USAGE, 1));
    expect(worded?.code).toBe("llm.provider_output_invalid");
    expect(worded?.reply?.misses).toEqual([{ path: "response.confidence", rule: "must be at most 1" }]);
    expect(thrownBy(() => automationStudioAnthropicTaskAnswer({ ...STEP_74, diagnosis: { ...STEP_74.diagnosis, answersRequest: "maybe" } }, verification(), USAGE, 1))?.reply?.misses).toEqual([{ path: "response.diagnosis.answersRequest", rule: 'must be one of "yes", "no", "unknown"' }]);
    expect(thrownBy(() => automationStudioAnthropicTaskAnswer({ kind: "diagnosis", summary: "x" }, verification(), USAGE, 1))?.reply?.misses).toEqual([{ path: "response.diagnosis", rule: "is missing, and it must be there" }]);
  });
});

describe("a task with no reader past its bounds", () => {
  it("keeps every length here, since this is all that holds it", () => {
    const task = request({ taskKind: "instruction_suggestion" });
    const schema = { type: "object", properties: { word: { type: "string", maxLength: 3 } } };
    expect(automationStudioAnthropicSchemaMisses({ word: "four" }, schema)).toEqual([{ path: "response.word", rule: "must have at most 3 characters" }]);
    expect(automationStudioAnthropicSchemaMisses({ word: "four" }, schema, { lengths: false })).toEqual([]);
    expect(automationStudioLlmTaskOutputSchema(task)).toBeUndefined();
  });
});

describe("the account of a reply that does not fit", () => {
  it("carries the case, the misses, what it cost and how long it was, and none of its words", async () => {
    const reply = { kind: "amend_draft", summary: "Speckled mug is wrong", decision: { kind: "amend_draft", amendments: [{ step: 0, change: "drop" }] }, note: "Speckled mug" };
    const text = envelope(reply);
    const failure = await failureOf(provider(text).runTask(amendingRequest()));
    expect(failure).toMatchObject({ code: "llm.provider_output_invalid", paid: { outputTokens: 30 }, reply: { case: "content_off_shape", finishReason: "end_turn", contentChars: text.length, usage: { outputTokens: 30 } } });
    expect(failure?.reply?.misses).toEqual(expect.arrayContaining([{ path: "response.kind", rule: 'must be exactly "evidence_tool_decision"' }]));
    expect(JSON.stringify(failure?.reply)).not.toContain("Speckled");
  });

  it("names a key the reply wrote only where it has the shape of a name", () => {
    const schema = { type: "object", additionalProperties: false, properties: {} };
    expect(automationStudioAnthropicSchemaMisses({ note: 1, "Speckled mug, 300ml!": 2 }, schema)).toEqual([{ path: "response.note", rule: "is not a key this object takes" }, { path: "response.?", rule: "is not a key this object takes" }]);
  });

  it("goes through the account's own bounds, so nothing but a path and a rule crosses", () => {
    const account = automationStudioLlmProviderReplyAccount({ case: "content_off_shape", misses: [{ path: "response.kind", rule: "must be exactly \"x\"" }, { path: "response.kind", rule: "Speckled mug was wrong" }, { path: "not a path at all", rule: "is missing, and it must be there" }, ...Array.from({ length: 12 }, () => ({ path: "response.a", rule: "must be text" }))] });
    expect(account?.misses?.[0]).toEqual({ path: "response.kind", rule: "must be exactly \"x\"" });
    expect(account?.misses).toHaveLength(8);
    expect(JSON.stringify(account)).not.toContain("Speckled");
  });

  it("tells the model the field and why, in the loop's feedback, by path and rule alone", async () => {
    const failure = await failureOf(provider(envelope({ kind: "diagnosis", summary: "Speckled mug", decision: STEP_67.decision })).runTask(amendingRequest()));
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: ["llm.provider_output_invalid"], stepsWithoutProgress: 0, maxStepsWithoutProgress: 8, unreadable: { reply: automationStudioLlmProviderReplyAccount(failure?.reply), inARow: 1, maxInARow: 6 } });
    expect(feedback).toMatchObject({ code: "llm_evidence_loop.reply_unreadable", unreadable: { case: "content_off_shape", said: "it was JSON, but it did not fit the answer asked for", misses: [{ path: "response.kind", rule: 'must be exactly "evidence_tool_decision"' }] } });
    expect(feedback.instruction).toContain('At fault: response.kind must be exactly "evidence_tool_decision".');
    expect(JSON.stringify(feedback)).not.toContain("Speckled");
  });
});

describe("the one walk", () => {
  it.each([
    [{ a: 1 }, { type: "object", required: ["a"], properties: { a: { type: "integer", minimum: 2 } } }],
    [{ a: 3 }, { type: "object", required: ["a"], properties: { a: { type: "integer", minimum: 2 } } }],
    ["x", { oneOf: [{ type: "string" }, { const: "x" }] }],
    ["x", { oneOf: [{ type: "string" }, { const: "y" }] }],
    [1, { anyOf: [{ type: "string" }, { type: "boolean" }] }],
    [[1, 1], { type: "array", uniqueItems: true }],
    [{ b: 1 }, { $ref: "#/$defs/shut", $defs: { shut: { type: "object", additionalProperties: false } } }],
    [{ b: 1 }, { not: { required: ["b"] } }],
    [2, { if: { minimum: 3 }, then: { const: 9 }, else: { const: 2 } }],
    [true, false],
    ["no", true]
  ])("answers %j against its schema as the matcher does", (value, schema) => {
    expect(automationStudioAnthropicSchemaMisses(value, schema).length === 0).toBe(automationStudioAnthropicMatchesSchema(value, schema));
  });

  it("in a union, reports the shape the reply came nearest, and not one whose own word it wrote differently", () => {
    const schema = automationStudioLlmTaskOutputSchema(amendingRequest());
    expect(automationStudioAnthropicSchemaMisses({ kind: "evidence_tool_decision", summary: "x", decision: { kind: "amend_draft", amendments: [{ step: 0, change: "drop" }] } }, schema)).toEqual([{ path: "response.decision.amendments[0].step", rule: "must be at least 1" }]);
  });
});
