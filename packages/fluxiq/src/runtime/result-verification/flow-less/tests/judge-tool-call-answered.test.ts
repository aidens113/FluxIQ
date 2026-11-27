// t1065: a judge continuing a decider sent as tools always answers in a form Core reads, with the cache intact, and never
// falls back to a judge that sees less. Live run `run-mwy3btww-31d32e0d` (Sonnet 5.5): all 7 continuing judges were lost.
// At 0039, 0060 and 0069 the judge reasoned in prose, then called the decider's `complete` with
// `{"summary":"placeholder","result":{"summary":"placeholder"}}` (`finish_reason: tool_use`); at 0034, 0077, 0104 and
// 0130 it reasoned in prose and ended with its object, two of them fenced (`content_prefixed`). Every one went standalone,
// to a judge that saw only the trail.
//
// Now every decider request sent as tools offers the check's answer tool, the judge answers by calling it, and a reply
// that is not that call, read, is answered in the same conversation. No model is called: the real Anthropic adapter, the
// real routing, the real harness and the real Flow-less judge run over a scripted fetch whose replies have the recorded
// shapes. The fixture is a kind of site no realistic scenario uses (a lending library's catalogue).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioLlmModelLadder, automationStudioLlmRoleRoutedResolution, runAutomationStudioLlmHarness, runWithAutomationStudioLlmModelLadder } from "../../../llm/index.ts";
import { createAutomationStudioAnthropicProvider } from "../../../llm/anthropic/index.ts";
import { decisionCall, decisionRequest, streamReply, toolUseStreamReply, useFixtureModel } from "../../../llm/anthropic/tests/fixtures.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessSummary } from "../types.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../llm/build-purse/index.ts";

const MODEL = "claude-sonnet-5-5";
const ANSWER_TOOL = "core_check_answer";
const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
const NO = { kind: "diagnosis", summary: "One title is missing.", diagnosis: { answersRequest: "no", observed: "The catalogue shows three titles that can be borrowed; the result holds two.", defects: [{ kind: "asked_missing", row: "rows not read", requestWords: "every title" }], checked: [], answerRecords: { asked: true, siteShows: 3 } } };
/** The reasoning a continuing judge sets out before its call or its object, as at 0060: prose, no verdict object. */
const REASONING = "I need to check whether every title that can be borrowed was listed. The catalogue page shows three titles marked available, and the result holds two of them. Sanditon is marked available on the shelf read, and it is not in the result.";
/** The recorded call's input shape: the decider's own tool, with placeholder input (0039, 0060, 0069). */
const PLACEHOLDER = { summary: "placeholder", result: { summary: "placeholder" } };

const summary = (): AutomationStudioFlowLessSummary => ({
  instructions: "List every title by Jane Austen on the catalogue's first page that can be borrowed, with columns title and shelf.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "title", label: "title" }, { id: "shelf", label: "shelf" }], rows: [{ title: "Persuasion", shelf: "North 4" }, { title: "Emma", shelf: "North 4" }] },
  acts: []
});

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; is_error?: boolean; content?: unknown; cache_control?: unknown };
type Wire = { model: string; tools?: Array<{ name: string }>; tool_choice?: unknown; system: unknown; thinking?: unknown; output_config?: unknown; messages: { role: string; content: string | Block[] }[] };

/**
 * Runs one attempt's decision, then its Flow-less judge continuing it, over `replies` (a list, or one reply for every
 * call after the decider's); what was sent and what the step log says. `extra` is more of the judge's input; `purse`,
 * where given, is the caller's purse every call is held on and charged to.
 */
async function judged(replies: ReadonlyArray<() => Response> | ((at: number) => Response), extra: Partial<AutomationStudioFlowLessJudgeInput> = {}, purse?: AutomationStudioLlmBuildPurse) {
  const directory = mkdtempSync(join(tmpdir(), "t1065-step-log-"));
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  try {
    const sent: Wire[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)) as Wire);
      if (typeof replies === "function") return sent.length === 1 ? decided() : replies(sent.length - 1);
      const reply = replies[sent.length - 1];
      if (!reply) throw new Error(`no reply scripted for call ${sent.length}`);
      return reply();
    });
    const resolver = async (input: { modelId?: string }) => ({
      provider: createAutomationStudioAnthropicProvider({ model: input.modelId ?? MODEL, secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch })
    });
    const provider = (await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "project-1", flowId: "flow-1", modelId: MODEL }))!.provider;
    const decider = decisionRequest();
    decider.deniedEvidenceKeys = [];
    decider.context.evidenceLoop!.evidence = ["call.1", "call.2", "call.3"].map((callId, at) => ({ callId, toolId: "core.run_node", value: { ok: true, page: `Shelf ${at + 1}: Emma, Persuasion, Sanditon.` } }));
    const attempt = () => runWithAutomationStudioLlmModelLadder(automationStudioLlmModelLadder(), async () => {
      await provider.runTask(decider);
      return await automationStudioFlowLessJudge({
        summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: ["selector"],
        continuesDecider: true, tokenLimits: { maxInputTokens: 900_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, ...extra
      });
    });
    const judgement = purse ? await automationStudioLlmBuildPurseScope(purse, attempt) : await attempt();
    const folders = readdirSync(directory).sort();
    const continuations = folders.filter((folder) => folder.endsWith("-judge")).map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { continuation?: unknown }).continuation);
    const notes = folders.filter((folder) => folder.endsWith("-note")).map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { line: string }).line);
    return { judgement, sent, continuations, notes };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const decided = () => toolUseStreamReply([decisionCall(DECISION)]);
/** 0060's shape: prose, then a call of a decision tool with placeholder input. */
const stray = () => toolUseStreamReply([{ name: decisionCall(DECISION).name, input: PLACEHOLDER }], "tool_use", undefined, REASONING);
/** The answer as it should come: reasoning, then the answer tool's call with the verdict as its input. */
const answer = (input: unknown = NO) => toolUseStreamReply([{ name: ANSWER_TOOL, input }], "tool_use", undefined, REASONING);

/** The continuation and every later ask keep the decider's tools, tool choice, system and format: the cached prefix holds. */
function expectPrefixKept(sent: readonly Wire[]): void {
  const [first, ...judges] = sent as [Wire, ...Wire[]];
  for (const wire of judges) {
    expect(JSON.stringify(wire.tools)).toBe(JSON.stringify(first.tools));
    expect(JSON.stringify(wire.tool_choice)).toBe(JSON.stringify(first.tool_choice));
    expect(JSON.stringify(wire.system)).toBe(JSON.stringify(first.system));
    expect(wire.output_config).toEqual(first.output_config);
  }
}

beforeEach(() => useFixtureModel(MODEL));
const environment = { ...process.env };
afterEach(() => {
  useFixtureModel("claude-haiku-5-5");
  process.env = { ...environment };
  vi.restoreAllMocks();
});

describe("a continuing judge that answers by the check's answer tool", () => {
  it("is offered that tool in the decider's own request, last, and its verdict is read from the call on the first ask", async () => {
    const { judgement, sent, continuations } = await judged([decided, () => answer()]);
    expect(judgement).toMatchObject({ verdict: "no" });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.tools!.at(-1)!.name).toBe(ANSWER_TOOL);
    expectPrefixKept(sent);
    expect(continuations).toEqual([{ used: true, reason: "continues_the_decider" }]);
    const turn = String(sent[1]!.messages[1]!.content);
    expect(turn).toContain("The instruction at its start to decide by calling one of the decision tools held for those decisions and holds no longer");
    expect(turn).toContain(`by calling ${ANSWER_TOOL} once, with the JSON object the judge's outputSchema asks for as its whole input`);
  });
});

describe("a continuing judge whose reply reasons and then calls a decision tool (0039, 0060, 0069)", () => {
  it("is answered in its own conversation, the call given a tool result, and the verdict it then gives is read; nothing goes standalone", async () => {
    const { judgement, sent, continuations, notes } = await judged([decided, stray, () => answer()]);
    expect(judgement).toMatchObject({ verdict: "no" });
    expect(sent).toHaveLength(3);
    expectPrefixKept(sent);
    const [, continuing, answered] = sent as [Wire, Wire, Wire];
    // The answer is the continuation's request again, byte for byte, then the reply as it came, then the tool result and the ask.
    expect(JSON.stringify(answered.messages.slice(0, continuing.messages.length))).toBe(JSON.stringify(continuing.messages));
    expect(answered.messages.map((message) => message.role)).toEqual(["user", "system", "assistant", "user"]);
    expect(answered.messages[2]!.content).toEqual([{ type: "text", text: REASONING }, { type: "tool_use", id: "toolu_0", name: decisionCall(DECISION).name, input: PLACEHOLDER }]);
    const [result, ask] = answered.messages[3]!.content as Block[];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_0", is_error: true });
    expect(String(result!.content)).toContain("No decision tool runs for the check");
    expect(ask!.text).toContain(`Answer the check now by calling ${ANSWER_TOOL} once`);
    expect(ask!.text).toContain("Your last reply to this check could not be read: it called one of the decision tools, which do not run for the check");
    expect(continuations).toEqual([{ used: true, reason: "continues_the_decider" }, { used: true, reason: "answers_its_reply_in_the_conversation" }]);
    expect(notes.some((note) => note.includes("so it stays in the decider's conversation"))).toBe(true);
  });

  it("calling one again is caught as repeating itself and steered, still in its conversation, and the verdict is read", async () => {
    const { judgement, sent, continuations } = await judged([decided, stray, stray, () => answer()]);
    expect(judgement).toMatchObject({ verdict: "no" });
    const last = sent[3]!;
    expect(last.messages.map((message) => message.role)).toEqual(["user", "system", "assistant", "user", "assistant", "user"]);
    expect(JSON.stringify(last.messages.slice(0, 4))).toBe(JSON.stringify(sent[2]!.messages));
    expect((last.messages[5]!.content as Block[])[1]!.text).toContain("You have sent the same unreadable reply 2 times in a row");
    expect(continuations).toEqual([
      { used: true, reason: "continues_the_decider" },
      { used: true, reason: "answers_its_reply_in_the_conversation" },
      { used: true, reason: "answers_its_reply_in_the_conversation" }
    ]);
  });
});

describe("a continuing judge whose reply reasons and then writes its object as text (0034, 0077: fenced; 0104: bare)", () => {
  it.each([
    ["fenced", `${REASONING}\n\n\`\`\`json\n${JSON.stringify(NO)}\n\`\`\`\n`],
    ["bare", `${REASONING}\n\n${JSON.stringify(NO)}`]
  ])("is not read out of the prose (%s): the reply is answered in its conversation and the verdict is read from the call it then makes", async (_shape, text) => {
    const { judgement, sent, continuations } = await judged([decided, () => streamReply(text), () => answer()]);
    expect(judgement).toMatchObject({ verdict: "no" });
    expectPrefixKept(sent);
    const answered = sent[2]!;
    expect(answered.messages.map((message) => message.role)).toEqual(["user", "system", "assistant", "user"]);
    // The streamed reply's thinking block came without a signature, so only its text goes back.
    expect(answered.messages[2]!.content).toEqual([{ type: "text", text }]);
    const asked = answered.messages[3]!.content as Block[];
    expect(asked).toHaveLength(1);
    expect(asked[0]!.text).toContain("it called none of the offered tools");
    expect(continuations).toEqual([{ used: true, reason: "continues_the_decider" }, { used: true, reason: "answers_its_reply_in_the_conversation" }]);
  });
});

describe("a continuing judge whose answer tool input does not fit", () => {
  it("is told in its conversation where the input parted from the schema, and the fixed answer is read", async () => {
    const { judgement, sent } = await judged([decided, () => answer({ kind: "diagnosis", summary: "Missing a title." }), () => answer()]);
    expect(judgement).toMatchObject({ verdict: "no" });
    const [result, ask] = sent[2]!.messages[3]!.content as Block[];
    expect(result).toMatchObject({ type: "tool_result", is_error: true, content: "This answer could not be read, so it was not taken: see below." });
    expect(ask!.text).toContain("it was JSON, but it did not fit the answer asked for: response.diagnosis");
  });
});

// The lead's check on t1065: a judge that never answers readably must still end, as any other call does, with no count
// of asks. Each ask in the conversation is a priced call on the purse, held at the size it is sent at (the adapter
// measures the continuation and its answered turns, not the judge's own request), and the check's deadline holds as before.
describe("a continuing judge that never answers readably", () => {
  /** Prose with no call, every time, at a price that is real: 10,000 input tokens a call. */
  const prose = () => streamReply(REASONING, "end_turn", { input_tokens: 10_000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } });

  it("ends on the purse, not judged and saying so, every ask after the first in its conversation and held at its sent size", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });
    const { judgement, sent, continuations } = await judged(() => prose(), {}, purse);
    expect(judgement).toMatchObject({ verdict: "not_judged", refusedByPurse: true });
    const asks = sent.length - 1;
    expect(asks).toBeGreaterThan(2);
    expect(asks).toBeLessThan(40);
    expect(continuations[0]).toEqual({ used: true, reason: "continues_the_decider" });
    expect(continuations.slice(1).every((each) => (each as { reason: string }).reason === "answers_its_reply_in_the_conversation")).toBe(true);
    // Each ask is the one before it with the reply and the answer to it appended: the conversation grows by two turns an ask.
    expect(sent.at(-1)!.messages).toHaveLength(2 + 2 * (asks - 1));
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBeGreaterThan(0);
  });

  it("ends at the check's deadline, not judged for time, where its calls cost next to nothing", async () => {
    const cheap = () => streamReply(REASONING);
    const { judgement, sent } = await judged(() => cheap(), { deadlineMs: 1_500 });
    expect(judgement).toMatchObject({ verdict: "not_judged", unanswered: true });
    expect((judgement as { reason?: string }).reason).toContain("ran out of time");
    expect(sent.length).toBeGreaterThan(3);
  });
});
