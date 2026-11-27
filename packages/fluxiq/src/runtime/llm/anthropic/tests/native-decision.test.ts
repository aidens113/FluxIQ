// D12 (t1038): an evidence decision goes to Anthropic as one native tool call, is read back from the streamed tool_use
// block into the wrapper the loop reads, and is held to the same reading and checks as before. No model is called: the
// fetch is scripted.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { automationStudioAnthropicRequest } from "../request.ts";
import { decisionCall, decisionRequest, request, streamReply, toolUseStreamReply } from "./fixtures.ts";

type Block = { type: "text"; text: string; cache_control?: unknown };
type Wire = { model: string; tools?: Array<{ name: string; strict?: boolean }>; tool_choice?: unknown; system: Block[]; messages: { role: string; content: string | Block[] }[]; output_config?: { format?: unknown } };

const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
const VERDICT = { kind: "diagnosis", diagnosis: { answersRequest: "yes", defects: [], checked: [{ row: "Emma", column: "title", value: "Emma" }], answerRecords: { asked: true, siteShows: 1 } }, summary: "The book on the shelf is listed." };
const ATTEMPT = "attempt.1";

function adapter(replies: Array<() => Response>, extra: { decisionTools?: boolean } = {}) {
  const sent: Wire[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Wire);
    return replies[Math.min(sent.length - 1, replies.length - 1)]!();
  });
  const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch, ...extra });
  return { provider, sent };
}

function decider(): AutomationStudioLlmTaskRequest {
  const task = decisionRequest();
  task.metadata = { ...task.metadata, attemptKey: ATTEMPT };
  task.deniedEvidenceKeys = [];
  task.context.evidenceLoop!.evidence = ["call.1", "call.2"].map((callId, at) => ({ callId, toolId: "core.run_node", value: { ok: true, page: `Shelf ${at + 1}: Emma, Persuasion.` } }));
  return task;
}

function judge(): AutomationStudioLlmTaskRequest {
  const base = request({ taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v3", expectedOutput: "diagnosis", deniedEvidenceKeys: [], metadata: { source: "test", attemptKey: ATTEMPT, continuesDecider: true } });
  const resultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", question: "Was it got?", trail: { note: "how to read it", entries: [{ n: 1, callId: "call.1", did: "core.run_node", outcome: "answered" }] }, totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "result", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Emma" }] }], flowShape: [], withheld: false };
  return { ...base, context: { ...base.context, taskKind: "loop_verification", promptVersion: base.promptVersion, resultSummary: resultSummary as unknown as NonNullable<AutomationStudioLlmTaskRequest["context"]["resultSummary"]> } };
}

const userText = (wire: Wire) => {
  const content = wire.messages[0]!.content;
  return typeof content === "string" ? content : content.map((block) => block.text).join("");
};

type Failure = { code: string; reply?: { case: string; finishReason?: string; misses?: Array<{ path: string; rule: string }> }; paid?: { outputTokens?: number } };
const failureOf = async (promise: Promise<unknown>) => await promise.then(() => undefined, (error: unknown) => error as Failure);

describe("an evidence decision sent as tools", () => {
  it("offers one tool per decision variant with one call at most, and no output format or outputSchema", async () => {
    const { provider, sent } = adapter([() => toolUseStreamReply([decisionCall(DECISION)])]);
    await provider.runTask(decider());
    const wire = sent[0]!;
    // The check's answer tool goes last in every decision sent as tools, so a continuing judge's tool list is the same bytes (t1065).
    expect(wire.tools!.map((tool) => tool.name)).toEqual(["core_inspect_values", "core_check_answer"]);
    expect(wire.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    // Haiku runs at its default effort, so nothing at all is left of output_config.
    expect(wire.output_config).toBeUndefined();
    expect(wire.system).toHaveLength(1);
    expect(wire.system[0]!.text.startsWith("Answer by calling exactly one of the offered tools")).toBe(true);
    expect(wire.system[0]!.text).not.toContain("outputSchema");
    expect(wire.system[0]!.text).not.toContain("result_json");
    expect(JSON.parse(userText(wire))).not.toHaveProperty("outputSchema");
  });

  it("keeps the user message's context byte for byte what the JSON-text transport sends", () => {
    const tools = automationStudioAnthropicRequest(decider(), "claude-haiku-5-5");
    const text = automationStudioAnthropicRequest(decider(), "claude-haiku-5-5", { decisionTools: false });
    const context = (body: string) => userText(JSON.parse(body) as Wire).split("\"context\":")[1];
    expect(tools.decisionTools).toBeDefined();
    expect(text.decisionTools).toBeUndefined();
    expect(context(tools.body)).toBe(context(text.body));
    expect(JSON.parse(text.body).output_config.format.schema.properties).toHaveProperty("result_json");
  });

  it("builds byte-identical tools for the same offer", () => {
    const one = JSON.parse(automationStudioAnthropicRequest(decider(), "claude-sonnet-5-5").body) as Wire;
    const two = JSON.parse(automationStudioAnthropicRequest(decider(), "claude-sonnet-5-5").body) as Wire;
    expect(JSON.stringify(two.tools)).toBe(JSON.stringify(one.tools));
    expect(JSON.stringify(two.tool_choice)).toBe(JSON.stringify(one.tool_choice));
  });

  it("reads the streamed tool_use, a line of text beside it, as exactly the wrapper the loop reads", async () => {
    const { provider } = adapter([() => toolUseStreamReply([decisionCall(DECISION)], "tool_use", undefined, "I will read the shelf.")]);
    const result = await provider.runTask(decider()) as { response: unknown; usage: { outputTokens: number } };
    expect(result.response).toEqual(DECISION);
    expect(result.usage.outputTokens).toBe(30);
  });

  it("refuses a tool the request did not offer as a paid failure that says so", async () => {
    const { provider } = adapter([() => toolUseStreamReply([{ name: "core_run_flow", input: { summary: "Go.", callId: "c", input: {} } }])]);
    const failure = await failureOf(provider.runTask(decider()));
    expect(failure).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_unknown", finishReason: "tool_use" }, paid: { outputTokens: 30 } });
  });

  it("refuses an off-shape input with its misses, by path and rule, against the original schema", async () => {
    const { input: _input, ...withoutInput } = decisionCall(DECISION).input;
    const { provider } = adapter([() => toolUseStreamReply([{ name: "core_inspect_values", input: { ...withoutInput, callId: "not a call id!" } }])]);
    const failure = await failureOf(provider.runTask(decider()));
    expect(failure).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "content_off_shape", finishReason: "tool_use" }, paid: { outputTokens: 30 } });
    expect(failure!.reply!.misses).toEqual(expect.arrayContaining([{ path: "response.decision.input", rule: "is missing, and it must be there" }, { path: "response.decision.callId", rule: "does not have the form the schema gives it" }]));
  });

  it("refuses a reply with no tool call, or with two, as paid failures that say which", async () => {
    const none = await failureOf(adapter([() => streamReply(JSON.stringify(DECISION))]).provider.runTask(decider()));
    expect(none).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_missing", finishReason: "end_turn" }, paid: { outputTokens: 30 } });
    const two = await failureOf(adapter([() => toolUseStreamReply([decisionCall(DECISION), decisionCall(DECISION)])]).provider.runTask(decider()));
    expect(two).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_several" } });
  });

  it("keeps the JSON-text transport where the provider is told to", async () => {
    const { provider, sent } = adapter([() => streamReply(JSON.stringify({ result_json: JSON.stringify(DECISION) }))], { decisionTools: false });
    const result = await provider.runTask(decider()) as { response: unknown };
    expect(result.response).toEqual(DECISION);
    expect(sent[0]!.tools).toBeUndefined();
  });

  it("is written readably in the step log: the tool call by name with its input, and the decision read", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t1038-step-log-"));
    const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      await adapter([() => toolUseStreamReply([decisionCall(DECISION)])]).provider.runTask(decider());
      const folder = readdirSync(directory).find((name) => name.endsWith("-decide"))!;
      const response = readFileSync(join(directory, folder, "response.txt"), "utf8");
      expect(response).toContain("finish reason: tool_use");
      expect(response).toContain("==== tool call core_inspect_values");
      expect(response).toContain("name: north");
      expect(JSON.parse(readFileSync(join(directory, folder, "decision.json"), "utf8")).response).toEqual(DECISION);
      expect(JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")).finishReason).toBe("tool_use");
    } finally {
      if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("a judge continuing a decider sent as tools", () => {
  it("sends the decider's tools, tool choice and system unchanged, no format of its own, and reads its answer from the check's answer tool", async () => {
    const { provider, sent } = adapter([() => toolUseStreamReply([decisionCall(DECISION)]), () => toolUseStreamReply([{ name: "core_check_answer", input: VERDICT }], "tool_use", undefined, "The shelf read lists the book.")]);
    await provider.runTask(decider());
    const answer = await provider.runTask(judge()) as { response: unknown };
    expect(answer.response).toMatchObject({ kind: "diagnosis", diagnosis: { answersRequest: "yes" } });
    const [decided, judged] = sent as [Wire, Wire];
    expect(JSON.stringify(judged.tools)).toBe(JSON.stringify(decided.tools));
    expect(JSON.stringify(judged.tool_choice)).toBe(JSON.stringify(decided.tool_choice));
    expect(JSON.stringify(judged.system)).toBe(JSON.stringify(decided.system));
    expect(judged.output_config).toEqual(decided.output_config);
    expect(Object.keys(judged)).toEqual(Object.keys(decided));
    const marks = (decided.messages[0]!.content as Block[]).map((block) => block.cache_control !== undefined).lastIndexOf(true);
    expect(JSON.stringify((judged.messages[0]!.content as Block[]).slice(0, marks + 1))).toBe(JSON.stringify((decided.messages[0]!.content as Block[]).slice(0, marks + 1)));
    expect(judged.messages[1]).toMatchObject({ role: "system" });
    expect(judged.messages[1]!.content).toContain("by calling core_check_answer once, with the JSON object the judge's outputSchema asks for as its whole input");
    expect(judged.messages[1]!.content).not.toContain("result_json");
  });

  it("refuses a judge's reply that calls a decision tool, or none, as a paid failure that says which (t1065)", async () => {
    const { provider } = adapter([() => toolUseStreamReply([decisionCall(DECISION)]), () => toolUseStreamReply([decisionCall(DECISION)]), () => streamReply(JSON.stringify(VERDICT))]);
    await provider.runTask(decider());
    expect(await failureOf(provider.runTask(judge()))).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_not_answer" }, paid: { outputTokens: 30 } });
    expect(await failureOf(provider.runTask(judge()))).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_missing" } });
  });

  // t1065: the purse holds each call at the provider's measure. A continuation was measured as the judge's own request,
  // a fraction of the decider's conversation it sends; each in-conversation ask is larger again.
  it("measures what it sends: the continuation, then each ask in the conversation, without changing what is held (t1065)", async () => {
    const { provider, sent } = adapter([() => toolUseStreamReply([decisionCall(DECISION)]), () => streamReply("The shelf lists it."), () => toolUseStreamReply([{ name: "core_check_answer", input: VERDICT }])]);
    await provider.runTask(decider());
    const own = automationStudioAnthropicRequest(judge(), "claude-haiku-5-5").estimatedInputTokens;
    const continuing = provider.measureInput!(judge()).estimatedInputTokens;
    expect(continuing).toBeGreaterThan(own);
    expect(provider.measureInput!(judge()).estimatedInputTokens).toBe(continuing);
    expect(await failureOf(provider.runTask(judge()))).toMatchObject({ reply: { case: "tool_call_missing" } });
    // Measuring held nothing back: the call still went as the continuation.
    expect(sent[1]!.messages).toHaveLength(2);
    const again = { ...judge(), metadata: { ...judge().metadata, judgeAnswersInConversation: true } };
    const asking = provider.measureInput!(again).estimatedInputTokens;
    expect(asking).toBeGreaterThan(continuing);
    expect(provider.measureInput!(again).estimatedInputTokens).toBe(asking);
    await provider.runTask(again);
    expect(sent[2]!.messages).toHaveLength(4);
    expect(Math.abs(asking - (Buffer.byteLength(JSON.stringify({ tools: sent[2]!.tools, tool_choice: sent[2]!.tool_choice, system: sent[2]!.system, messages: sent[2]!.messages, output_config: sent[2]!.output_config }), "utf8") / 3))).toBeLessThan(40);
  });

  it("refuses a decision that calls the check's answer tool, by name (t1065)", async () => {
    const { provider } = adapter([() => toolUseStreamReply([{ name: "core_check_answer", input: VERDICT }])]);
    expect(await failureOf(provider.runTask(decider()))).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_check_only" } });
  });
});
