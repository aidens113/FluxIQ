// t1089: a judge marked as continuing the decider that the adapter sends on its own request after all is sent the page
// views its message carries, and a judge that really continues has them left out (`../provider.ts`,
// `../../../models/providers/anthropic/continuation.ts`). t1084 gave the views to every judge that does not continue; the
// adapter decides whether one marked as continuing does, after the request was built. Its three ways back to the judge's
// own request -- no decider held for the attempt, a continuation past the window, a decider that offered no answer tool --
// each send the request as built, the views included. No model is called: the fetch is scripted. The site is a kind no
// realistic scenario uses (a garden centre).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { decisionCall, decisionRequest, request, streamReply, toolUseStreamReply } from "./fixtures.ts";

/** Where set, the decider's request goes out without the check's answer tool, as one built before t1065 did. */
const strip = vi.hoisted(() => ({ answerTool: false }));
vi.mock("../request.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../request.ts")>();
  return {
    ...actual,
    automationStudioAnthropicRequest: (...args: Parameters<typeof actual.automationStudioAnthropicRequest>) => {
      const prepared = actual.automationStudioAnthropicRequest(...args);
      if (!strip.answerTool || !prepared.decisionTools) return prepared;
      const body = JSON.parse(prepared.body) as { tools: Array<{ name: string }> };
      return { ...prepared, body: JSON.stringify({ ...body, tools: body.tools.filter((tool) => tool.name !== "core_check_answer") }) };
    }
  };
});

type Block = { type: "text"; text: string; cache_control?: unknown };
type Wire = { tools?: Array<{ name: string }>; messages: { role: string; content: string | Block[] }[] };

const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
const ATTEMPT = "attempt.1";
/** A line of a page only the views hold: neither the decider's evidence nor the trail says it. */
const PAGE_LINE = 't44 "Lily pad basket, 30 cm - collect today"';
const PAGE_VIEWS = { note: "The page text of each view named here.", endView: { text: ['PAGE "Basket - Garden"', PAGE_LINE].join("\n") } };

function decider(page = "Shelf: Watering Can, Seed Tray."): AutomationStudioLlmTaskRequest {
  const task = decisionRequest();
  task.metadata = { ...task.metadata, attemptKey: ATTEMPT };
  task.deniedEvidenceKeys = [];
  task.context.evidenceLoop!.evidence = ["call.1", "call.2"].map((callId) => ({ callId, toolId: "core.run_node", value: { ok: true, page } }));
  return task;
}

/** A judge marked as continuing, its message carrying the page views last, as the Flow-less judge sends it (t1084, t1089). */
function judge(extra: { tokenLimits?: AutomationStudioLlmTaskRequest["tokenLimits"]; again?: boolean; pages?: boolean } = {}): AutomationStudioLlmTaskRequest {
  const base = request({ taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v3", expectedOutput: "diagnosis", deniedEvidenceKeys: [], metadata: { source: "test", attemptKey: ATTEMPT, continuesDecider: true, ...(extra.again ? { judgeAnswersInConversation: true } : {}) }, ...(extra.tokenLimits ? { tokenLimits: extra.tokenLimits } : {}) });
  const resultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", question: "Was it got?", trail: { note: "how to read it", entries: [{ n: 1, callId: "call.1", did: "core.run_node", outcome: "answered" }] }, totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "result", recordCount: 1, refusedCount: 0, truncated: false, columns: ["item"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ item: "Lily pad basket" }] }], flowShape: [], withheld: false, ...(extra.pages === false ? {} : { pageViews: PAGE_VIEWS }) };
  return { ...base, context: { ...base.context, taskKind: "loop_verification", promptVersion: base.promptVersion, resultSummary: resultSummary as unknown as NonNullable<AutomationStudioLlmTaskRequest["context"]["resultSummary"]> } };
}

function adapter(decisionTools: boolean, deciderReply: () => Response) {
  const sent: Wire[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Wire);
    return sent.length === 1 ? deciderReply() : streamReply(JSON.stringify({ kind: "diagnosis", summary: "Judged." }));
  });
  const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", decisionTools, fetchImpl: fetchImpl as unknown as typeof fetch });
  return { provider, sent };
}

const jsonTextDecider = () => adapter(false, () => streamReply(JSON.stringify({ result_json: JSON.stringify(DECISION) })));
const toolsDecider = () => adapter(true, () => toolUseStreamReply([decisionCall(DECISION)]));

/** The judge's own message: the whole user turn on its own request (its blocks joined), the block after the decider's on a continuation. */
function judgeMessage(wire: Wire): { context: { resultSummary: Record<string, unknown> } } {
  const content = wire.messages[0]!.content;
  const text = typeof content === "string" ? content : wire.messages.length > 1 ? content[content.length - 1]!.text : content.map((block) => block.text).join("");
  return JSON.parse(text) as { context: { resultSummary: Record<string, unknown> } };
}

/** What each judge call's step meta says of its continuation, in the order made (t967). */
async function continuations(run: () => Promise<void>): Promise<unknown[]> {
  const directory = mkdtempSync(join(tmpdir(), "t1089-step-log-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  try {
    await run();
    return readdirSync(directory).filter((folder) => folder.endsWith("-judge")).sort().map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { continuation?: unknown }).continuation);
  } finally {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("a judge marked as continuing the decider", () => {
  it("that really continues has its page views left out: it reads the pages in the decider's conversation", async () => {
    const { provider, sent } = jsonTextDecider();
    const reasons = await continuations(async () => {
      await provider.runTask(decider());
      // Only what was sent is read here: the scripted reply is not in the decider's transport.
      await provider.runTask(judge()).catch(() => undefined);
    });
    expect(reasons).toEqual([{ used: true, reason: "continues_the_decider" }]);
    const judged = sent[1]!;
    expect(judged.messages).toHaveLength(2);
    expect(judgeMessage(judged).context.resultSummary).not.toHaveProperty("pageViews");
    expect(JSON.stringify(judged)).not.toContain("Lily pad basket, 30 cm");
    // What the harness holds the purse to is what is sent: the continuation measures as one that never carried the views.
    expect(provider.measureInput!(judge())).toEqual(provider.measureInput!(judge({ pages: false })));
  });

  it("sent on its own request because no decider is held for its attempt carries them, last", async () => {
    const { provider, sent } = jsonTextDecider();
    const reasons = await continuations(async () => {
      await provider.runTask(judge()).catch(() => undefined);
    });
    expect(reasons).toEqual([{ used: false, reason: "no_decider_request_held_for_this_attempt_on_this_model" }]);
    expect(sent[0]!.messages).toHaveLength(1);
    const summary = judgeMessage(sent[0]!).context.resultSummary;
    expect(Object.keys(summary).at(-1)).toBe("pageViews");
    expect(summary.pageViews).toEqual(PAGE_VIEWS);
  });

  it("sent on its own request because the continuation is past the window carries them", async () => {
    const { provider, sent } = jsonTextDecider();
    // The decider's conversation alone is past the judge's limits; the judge's own request, its views included, is not.
    const limits = { maxInputTokens: 60_000, maxOutputTokens: 8_000, maxTotalTokens: 70_000 };
    const reasons = await continuations(async () => {
      await provider.runTask(decider("Shelf: ".concat("Watering Can, Seed Tray. ".repeat(10_000))));
      await provider.runTask(judge({ tokenLimits: limits })).catch(() => undefined);
    });
    expect(reasons).toEqual([{ used: false, reason: "continuation_past_the_window" }]);
    expect(sent[1]!.messages).toHaveLength(1);
    expect(judgeMessage(sent[1]!).context.resultSummary.pageViews).toEqual(PAGE_VIEWS);
  });

  it("sent on its own request because the decider offered no answer tool carries them", async () => {
    strip.answerTool = true;
    try {
      const { provider, sent } = toolsDecider();
      const reasons = await continuations(async () => {
        await provider.runTask(decider());
        await provider.runTask(judge()).catch(() => undefined);
      });
      expect(sent[0]!.tools!.map((tool) => tool.name)).not.toContain("core_check_answer");
      expect(reasons).toEqual([{ used: false, reason: "decider_offered_no_check_answer_tool" }]);
      expect(sent[1]!.messages).toHaveLength(1);
      expect(judgeMessage(sent[1]!).context.resultSummary.pageViews).toEqual(PAGE_VIEWS);
    } finally {
      strip.answerTool = false;
    }
  });

  it("asked again in the decider's conversation with no reply held keeps them, as before (t1067)", async () => {
    const { provider, sent } = toolsDecider();
    const reasons = await continuations(async () => {
      await provider.runTask(decider());
      await provider.runTask(judge({ again: true })).catch(() => undefined);
    });
    expect(reasons).toEqual([{ used: true, reason: "continues_the_decider_again" }]);
    expect(judgeMessage(sent[1]!).context.resultSummary.pageViews).toEqual(PAGE_VIEWS);
  });

  it("is held to the window by what is sent: a continuation is not refused for the size of the views it leaves out", async () => {
    const { provider, sent } = jsonTextDecider();
    // Views too large for the judge's own request, which a continuation does not carry.
    const big = { ...judge(), tokenLimits: { maxInputTokens: 60_000, maxOutputTokens: 8_000, maxTotalTokens: 70_000 } };
    (big.context.resultSummary as unknown as Record<string, unknown>).pageViews = { note: "n", endView: { text: "Seed Tray, 24 Cells. ".repeat(12_000) } };
    await provider.runTask(decider());
    // Only what was sent is read here: the scripted reply is not in the decider's transport.
    await provider.runTask(big).catch(() => undefined);
    expect(sent[1]!.messages).toHaveLength(2);
    expect(judgeMessage(sent[1]!).context.resultSummary).not.toHaveProperty("pageViews");
    // The same request sent on its own is refused by size, nothing trimmed.
    const { provider: alone } = jsonTextDecider();
    await expect(alone.runTask(big)).rejects.toMatchObject({ code: "llm.provider_input_budget_exceeded" });
  });
});
