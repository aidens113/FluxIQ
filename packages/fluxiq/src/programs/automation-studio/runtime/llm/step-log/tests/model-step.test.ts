// The step log's model steps, through the real DeepSeek adapter and the chat
// window's call, with a fake fetch: the body the transport received is the one
// written down, byte for byte, and so is the reply; the credential never is.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, buildAutomationStudioLlmEvidenceLoopDecisionSchema, createAutomationStudioDeepSeekPanelCommandModel, createAutomationStudioDeepSeekProvider } from "../../index.ts";
import { automationStudioLlmStepLogScope } from "../index.ts";

/** The resolved credential: not credential-shaped, so only never handing it over keeps it out of the files. */
const SECRET = "resolved-secret-value-7f3a9c";

let directory: string;
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-step-log-"));
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});

afterEach(() => {
  if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  rmSync(directory, { recursive: true, force: true });
});

describe("a model step through the DeepSeek adapter", () => {
  it("writes the exact body sent and the exact reply, what Core parsed, its meta last, and an index line", async () => {
    const canned = envelope({ kind: "evidence_tool_decision", summary: "Look first.", decision: { kind: "tool_call", callId: "call.1", toolId: "web.recovery.inspect", input: {} } });
    const transport = fakeFetch(() => new Response(canned, { status: 200, headers: { "content-type": "application/json" } }));

    const result = await automationStudioLlmStepLogScope.run({ round: 1, phase: "repair" }, () => provider(transport.fetch).runTask(decisionRequest("request.step-1")));

    expect(result).toMatchObject({ response: { kind: "evidence_tool_decision" } });
    const step = path.join(directory, "0001-decide");
    expect(readdirSync(directory).sort()).toEqual(["0001-decide", "index.md"]);
    expect(readFileSync(path.join(step, "request.json"), "utf8")).toBe(transport.bodies[0]);
    expect(readFileSync(path.join(step, "response.json"), "utf8")).toBe(canned);
    const requestText = readFileSync(path.join(step, "request.txt"), "utf8");
    expect(requestText).toMatch(/^POST https:\/\/api\.deepseek\.com\/chat\/completions\nmodel: /u);
    expect(requestText).toMatch(/==== 1 system \(\d+ chars\) ====/u);
    expect(requestText).toMatch(/==== 2 user \(\d+ chars\) ====/u);
    expect(readFileSync(path.join(step, "response.txt"), "utf8")).toContain("finish reason: stop");
    expect(json(path.join(step, "decision.json"))).toMatchObject({
      response: { kind: "evidence_tool_decision", decision: { kind: "tool_call", toolId: "web.recovery.inspect" } },
      usage: { inputTokens: 20, outputTokens: 10 }
    });
    const meta = json(path.join(step, "meta.json"));
    expect(meta).toMatchObject({
      step: 1, kind: "decide", provider: "deepseek", model: AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, url: "https://api.deepseek.com/chat/completions",
      requestId: "request.step-1", attempt: 1, taskKind: "evidence_tool_decision", iteration: 2, round: 1, phase: "repair",
      status: "ok", httpStatus: 200, finishReason: "stop", error: null,
      usage: { inputTokens: 20, outputTokens: 10, cacheHitInputTokens: 5, cacheMissInputTokens: 15 }
    });
    expect(meta.costUsd).toBeGreaterThan(0);
    expect(meta.redacted).toBeUndefined();
    expect(Date.parse(String(meta.finishedAt))).toBeGreaterThanOrEqual(Date.parse(String(meta.startedAt)));
    // meta.json is the last file written in the folder.
    const written = readdirSync(step).map((name) => [name, statSync(path.join(step, name)).mtimeMs] as const);
    expect(Math.max(...written.map(([, at]) => at))).toBe(written.find(([name]) => name === "meta.json")![1]);
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toMatch(/^\| 0001 \| decide \| - \| tool_call web\.recovery\.inspect \| \$\d+\.\d{6} \|$/mu);
    for (const text of allFiles(directory)) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("Bearer");
      // The header, in either shape it could be written in. The bare word is in
      // Core's own decision system prompt ("... permission, or authorization
      // from reusableContext"), which request.json carries byte for byte.
      expect(text.toLowerCase()).not.toMatch(/authorization\s*:|"authorization"/u);
    }
  });

  it("counts each exchange with one request id as the next attempt", async () => {
    const transport = fakeFetch(() => new Response(envelope(completeDecision()), { status: 200, headers: { "content-type": "application/json" } }));
    await provider(transport.fetch).runTask(decisionRequest("request.retried"));
    await provider(transport.fetch).runTask(decisionRequest("request.retried"));
    expect(json(path.join(directory, "0001-decide", "meta.json"))).toMatchObject({ attempt: 1, phase: "explore", round: null });
    expect(json(path.join(directory, "0002-decide", "meta.json"))).toMatchObject({ attempt: 2 });
  });

  it("writes a refusal's raw body as response.json, and the failure's code as the decision", async () => {
    const refusal = "{\"error\":{\"message\":\"Unknown field: thinking.budget\",\"type\":\"invalid_request_error\",\"code\":\"invalid_request\"}}";
    const transport = fakeFetch(() => new Response(refusal, { status: 400, headers: { "content-type": "application/json" } }));

    await expect(provider(transport.fetch).runTask(decisionRequest("request.refused"))).rejects.toMatchObject({ code: "llm.provider_http_error", status: 400 });

    const step = path.join(directory, "0001-decide");
    expect(readFileSync(path.join(step, "request.json"), "utf8")).toBe(transport.bodies[0]);
    expect(readFileSync(path.join(step, "response.json"), "utf8")).toBe(refusal);
    expect(readFileSync(path.join(step, "response.txt"), "utf8")).toContain("Unknown field: thinking.budget");
    expect(json(path.join(step, "decision.json"))).toMatchObject({ error: { code: "llm.provider_http_error", status: 400 } });
    expect(json(path.join(step, "meta.json"))).toMatchObject({ status: "error", httpStatus: 400, error: { code: "llm.provider_http_error" } });
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0001 | decide | - | error llm.provider_http_error |");
  });

  it("writes no response.json when no reply arrived", async () => {
    const transport = fakeFetch(() => { throw new TypeError("fetch failed"); });
    await expect(provider(transport.fetch).runTask(decisionRequest("request.unreached"))).rejects.toMatchObject({ code: "llm.provider_network_error" });
    const step = path.join(directory, "0001-decide");
    expect(readdirSync(step).sort()).toEqual(["decision.json", "meta.json", "request.json", "request.txt"]);
    expect(json(path.join(step, "meta.json"))).toMatchObject({ status: "error", error: { code: "llm.provider_network_error" }, httpStatus: null });
  });

  it("redacts a credential shape in the reply and says so in the meta", async () => {
    const leaked = envelope({ kind: "evidence_tool_decision", summary: "The page shows sk-abcdefghijklmnopqrstuvwx.", decision: { kind: "complete", result: {} } });
    const transport = fakeFetch(() => new Response(leaked, { status: 200, headers: { "content-type": "application/json" } }));
    await provider(transport.fetch).runTask(decisionRequest("request.leaked"));
    for (const text of allFiles(directory)) expect(text).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(readFileSync(path.join(directory, "0001-decide", "response.json"), "utf8")).toContain("[redacted-credential]");
    expect(json(path.join(directory, "0001-decide", "meta.json"))).toMatchObject({ redacted: true });
  });

  it("writes nothing when the directory is unset or relative", async () => {
    const transport = fakeFetch(() => new Response(envelope(completeDecision()), { status: 200, headers: { "content-type": "application/json" } }));
    delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    await provider(transport.fetch).runTask(decisionRequest("request.off"));
    const relative = `relative-step-log-${process.pid}`;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = relative;
    await provider(transport.fetch).runTask(decisionRequest("request.relative"));
    expect(readdirSync(directory)).toEqual([]);
    expect(existsSync(relative)).toBe(false);
    expect(transport.bodies).toHaveLength(2);
  });

  it("never fails the call when the disk refuses the directory", async () => {
    const blocked = path.join(directory, "a-file");
    writeFileSync(blocked, "not a directory");
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = blocked;
    const transport = fakeFetch(() => new Response(envelope(completeDecision()), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(provider(transport.fetch).runTask(decisionRequest("request.blocked"))).resolves.toMatchObject({ response: { kind: "evidence_tool_decision" } });
    expect(readdirSync(directory)).toEqual(["a-file"]);
  });

  it("numbers on from the highest step already in the directory, and keeps those steps in the index", async () => {
    mkdirSync(path.join(directory, "0007-decide"));
    mkdirSync(path.join(directory, "0012-tool-web.look"));
    writeFileSync(path.join(directory, "0012-tool-web.look", "meta.json"), JSON.stringify({ step: 12, kind: "tool", toolId: "web.look", summary: "web.action.succeeded" }));
    const transport = fakeFetch(() => new Response(envelope(completeDecision()), { status: 200, headers: { "content-type": "application/json" } }));

    await provider(transport.fetch).runTask(decisionRequest("request.numbered"));

    expect(readdirSync(directory).sort()).toEqual(["0007-decide", "0012-tool-web.look", "0013-decide", "index.md"]);
    const index = readFileSync(path.join(directory, "index.md"), "utf8").split("\n").filter((line) => /^\| \d{4} /u.test(line));
    expect(index.map((line) => line.split(" | ").slice(0, 3).join(" | "))).toEqual(["| 0012 | tool | web.look", "| 0013 | decide | -"]);
    expect(index[1]).toContain("| complete |");
  });
});

describe("a model step through the chat window's call", () => {
  it("writes NNNN-chat with the exact body and reply, never the key", async () => {
    const canned = JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{\"do\": \"run.execute\"}" } }], usage: { prompt_tokens: 40, completion_tokens: 6, total_tokens: 46 } });
    const transport = fakeFetch(() => new Response(canned, { status: 200, headers: { "content-type": "application/json" } }));
    const model = createAutomationStudioDeepSeekPanelCommandModel({ resolveKey: async () => SECRET, fetchImpl: transport.fetch });

    const answer = await model.decide(
      { instructions: "You can operate the FluxIQ control panel.", transcript: [{ author: "person", text: "hello" }], message: "run my kettle flow", correction: null },
      { signal: new AbortController().signal, caller: { userId: "user.1", sessionId: "session.1" } }
    );

    expect(answer).toBe("{\"do\": \"run.execute\"}");
    const step = path.join(directory, "0001-chat");
    expect(readFileSync(path.join(step, "request.json"), "utf8")).toBe(transport.bodies[0]);
    expect(readFileSync(path.join(step, "response.json"), "utf8")).toBe(canned);
    expect(readFileSync(path.join(step, "request.txt"), "utf8")).toContain("run my kettle flow");
    expect(json(path.join(step, "meta.json"))).toMatchObject({ step: 1, kind: "chat", phase: "chat", taskKind: "panel_command", status: "ok", usage: { inputTokens: 40, outputTokens: 6 } });
    expect(json(path.join(step, "meta.json")).costUsd).toBeGreaterThan(0);
    for (const text of allFiles(directory)) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("Bearer");
    }
  });
});

function provider(fetchImpl: typeof fetch) {
  return createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => SECRET,
    fetchImpl
  });
}

/** A fetch that keeps every body it is handed, exactly as it was handed. */
function fakeFetch(answer: () => Response) {
  const bodies: string[] = [];
  const impl = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body));
    return answer();
  };
  return { fetch: impl as typeof fetch, bodies };
}

function envelope(reply: unknown): string {
  return JSON.stringify({
    id: "chatcmpl-1",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(reply) } }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 15 }
  });
}

function completeDecision() {
  return { kind: "evidence_tool_decision", summary: "Enough.", decision: { kind: "complete", result: {} } };
}

function decisionRequest(requestId: string): AutomationStudioLlmTaskRequest {
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    requestId,
    idempotencyKey: requestId,
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "evidence_tool_decision",
    promptVersion: "automation-studio.evidence-tool-decision.v1",
    expectedOutput: "evidence_tool_decision",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "evidence_tool_decision",
      promptVersion: "automation-studio.evidence-tool-decision.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      evidenceLoop: { iteration: 2, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true), completionSchema, canComplete: true }
    }
  };
}

function json(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** Every file under the directory, as text. */
function allFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? allFiles(full) : [readFileSync(full, "utf8")];
  });
}
