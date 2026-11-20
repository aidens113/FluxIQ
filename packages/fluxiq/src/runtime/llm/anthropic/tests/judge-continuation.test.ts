// t965: a judge that continues the decider's conversation is sent as the decider's latest request, byte for byte up to
// its last cache mark, with the judging appended (`../../../models/providers/anthropic/continuation.ts`). A paid probe
// showed the judge's own output format makes the whole prefix a cache miss, so the judge keeps the decider's JSON-text
// format and carries its own outputSchema in its message. No model is called: the fetch is scripted.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { decisionRequest, request, streamReply } from "./fixtures.ts";

type Block = { type: "text"; text: string; cache_control?: unknown };
type Wire = { model: string; max_tokens: number; system: Block[]; messages: { role: string; content: string | Block[] }[]; output_config: unknown; thinking?: unknown };

const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
const VERDICT = { kind: "diagnosis", diagnosis: { answersRequest: "yes", defects: [], checked: [{ row: "Emma", column: "title", value: "Emma" }], answerRecords: { asked: true, siteShows: 1 } }, summary: "The book on the shelf is listed." };

/** Every call of an attempt carries its attempt's key, as the routing stamps it (`../../role-routing/provider.ts`, t967). */
const ATTEMPT = "attempt.1";

function decider(attemptKey = ATTEMPT): AutomationStudioLlmTaskRequest {
  const task = decisionRequest();
  task.metadata = { ...task.metadata, attemptKey };
  // Declared, as a bound domain declares them: nothing is denied.
  task.deniedEvidenceKeys = [];
  task.context.evidenceLoop!.evidence = ["call.1", "call.2", "call.3"].map((callId, at) => ({ callId, toolId: "core.run_node", value: { ok: true, page: `Shelf ${at + 1}: Emma, Persuasion, Sanditon.` } }));
  return task;
}

/** The judge of the same Flow, its trail holding the attempt's calls and one step of a saved Flow's run (no call id). */
function judge(callIds: readonly string[], continuesDecider = true, attemptKey = ATTEMPT): AutomationStudioLlmTaskRequest {
  const base = request({ taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v3", expectedOutput: "diagnosis", deniedEvidenceKeys: [], metadata: { source: "test", attemptKey, ...(continuesDecider ? { continuesDecider: true } : {}) } });
  const entries = [...callIds.map((callId, at) => ({ n: at + 1, callId, did: "core.run_node", outcome: "answered" })), { n: callIds.length + 1, did: "catalogue.read", outcome: "succeeded" }];
  const resultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", question: "Was it got?", trail: { note: "how to read it", entries }, totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "result", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Emma" }] }], flowShape: [], withheld: false };
  return { ...base, context: { ...base.context, taskKind: "loop_verification", promptVersion: base.promptVersion, resultSummary: resultSummary as unknown as NonNullable<AutomationStudioLlmTaskRequest["context"]["resultSummary"]> } };
}

function adapter() {
  const sent: Wire[] = [];
  const replies = [JSON.stringify({ result_json: JSON.stringify(DECISION) }), JSON.stringify({ result_json: JSON.stringify(VERDICT) })];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Wire);
    return streamReply(replies[Math.min(sent.length - 1, replies.length - 1)]!);
  });
  const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch });
  return { provider, sent };
}

const lastMark = (blocks: Block[]) => blocks.map((block) => block.cache_control !== undefined).lastIndexOf(true);

describe("a judge continuing the decider's conversation", () => {
  it("is the decider's request byte for byte up to its last cache mark, then the judging, and is read as the judge's answer", async () => {
    const { provider, sent } = adapter();
    await provider.runTask(decider());
    const answer = await provider.runTask(judge(["call.1", "call.2", "call.3"]));
    expect((answer as { response?: unknown }).response).toMatchObject({ kind: "diagnosis", diagnosis: { answersRequest: "yes" } });
    const [decided, judged] = sent as [Wire, Wire];
    // Same model, top-level settings, system blocks and output format: all part of the cached prefix.
    expect(judged.model).toBe(decided.model);
    expect(judged.max_tokens).toBe(decided.max_tokens);
    expect(judged.thinking).toEqual(decided.thinking);
    expect(JSON.stringify(judged.system)).toBe(JSON.stringify(decided.system));
    expect(JSON.stringify(judged.output_config)).toBe(JSON.stringify(decided.output_config));
    expect(Object.keys(judged)).toEqual(Object.keys(decided));
    // The user turn's blocks, up to and including the decider's last mark, are the same bytes.
    const deciderBlocks = decided.messages[0]!.content as Block[];
    const judgeBlocks = judged.messages[0]!.content as Block[];
    const mark = lastMark(deciderBlocks);
    expect(mark).toBeGreaterThan(0);
    expect(JSON.stringify(judgeBlocks.slice(0, mark + 1))).toBe(JSON.stringify(deciderBlocks.slice(0, mark + 1)));
    // Then the judge's own message, with the calls the decider's evidence holds left out, and its instructions as a system message, last.
    const appended = JSON.parse(judgeBlocks[mark + 1]!.text) as { expectedOutput: string; outputSchema: unknown; context: { resultSummary: { trail: { entries: { callId?: string }[]; shownAbove: string } } } };
    expect(appended.expectedOutput).toBe("diagnosis");
    expect(appended.outputSchema).toBeDefined();
    expect(appended.context.resultSummary.trail.entries).toEqual([{ n: 4, did: "catalogue.read", outcome: "succeeded" }]);
    expect(appended.context.resultSummary.trail.shownAbove).toContain("3 of the attempt's calls are in its evidence above");
    expect(judged.messages).toHaveLength(2);
    expect(judged.messages[1]).toMatchObject({ role: "system" });
    expect(judged.messages[1]!.content).toContain("You are now the check of what it got");
    expect(judged.messages[1]!.content).toContain("Return exactly one JSON object matching the requested expectedOutput.");
  });

  it("is a judge of its own where it does not continue the decider: a saved Flow's replay judged before any decision", async () => {
    const { provider, sent } = adapter();
    await provider.runTask(decider());
    // Its own native format: the scripted reply in the decider's transport is not its answer, and only what was sent is read here.
    await provider.runTask(judge(["call.1", "call.2", "call.3"], false)).catch(() => undefined);
    const judged = sent[1]!;
    expect(judged.messages).toHaveLength(1);
    expect(JSON.stringify(judged.output_config)).not.toBe(JSON.stringify(sent[0]!.output_config));
  });

  it("is a judge of its own where the decider held is another attempt's, by the attempt's key", async () => {
    const { provider, sent } = adapter();
    await provider.runTask(decider("attempt.1"));
    await provider.runTask(judge(["call.1", "call.2", "call.3"], true, "attempt.2")).catch(() => undefined);
    expect(sent[1]!.messages).toHaveLength(1);
  });

  // t967: run-mwohvt8n-a57cad8a's judges fell back and nothing said why. Each judge's step meta now says.
  it("says in its step meta whether it continued the decider, and why not where it did not", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t967-step-log-"));
    const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      const { provider } = adapter();
      await provider.runTask(decider());
      await provider.runTask(judge(["call.1"]));
      await provider.runTask(judge(["call.1"], true, "attempt.2")).catch(() => undefined);
      await provider.runTask(judge(["call.1"], false)).catch(() => undefined);
      const metas = readdirSync(directory).filter((folder) => folder.endsWith("-judge")).sort().map((folder) => JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { continuation?: unknown });
      expect(metas.map((meta) => meta.continuation)).toEqual([
        { used: true, reason: "continues_the_decider" },
        { used: false, reason: "no_decider_request_held_for_this_attempt_on_this_model" },
        { used: false, reason: "no_decision_in_this_attempt" }
      ]);
    } finally {
      if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
