// A Flow model call whose reply DeepSeek starts and never finishes ends at its
// deadline, through the retry seam every provider call passes (t613).
//
// DeepSeek answers a non-streaming request it has queued with headers and then
// blank lines until it is scheduled. In A8 wave 4 a chat attempt read such a
// body past its timeout, because Node's `fetch` did not end the read when the
// signal fired. The Flow-build adapter (`../../deepseek/provider.ts`) reads its
// body the same way. This drives the real adapter through
// `automationStudioLlmProviderCall` with its `fetchImpl` sending DeepSeek's
// request to a local HTTP server that trickles a blank line every 100 ms: the
// call ends at its deadline, the step log writes `llm.provider_timeout` at that
// moment, and the retry layer sees the retryable timeout it never re-sends.
// No real provider is called; the secret is a fixed fake.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../index.ts";
import { automationStudioLlmProviderCall } from "../call.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../ledger.ts";

const DEADLINE_MS = 1_500;
const FAKE_SECRET = "local-test-only-secret-0000";

let server: http.Server;
let base = "";
let stepDirectory = "";
const open = new Set<http.ServerResponse>();

beforeAll(async () => {
  server = http.createServer((request, response) => {
    request.resume();
    open.add(response);
    response.writeHead(200, { "content-type": "application/json" });
    const tick = setInterval(() => response.write("\n"), 100);
    response.on("close", () => {
      clearInterval(tick);
      open.delete(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const response of open) response.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  stepDirectory = mkdtempSync(path.join(tmpdir(), "fluxiq-stalled-provider-steps-"));
  vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", stepDirectory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(stepDirectory, { recursive: true, force: true });
});

/**
 * DeepSeek's request, sent to the local server instead; any other address is
 * refused. The reply is handed back with its own body stream but no URL, since
 * the adapter refuses a reply from anywhere but DeepSeek's endpoint.
 */
function localFetch(signalReachesBody: boolean): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL) throw new Error(`This test sends only DeepSeek's request, never ${String(input)}.`);
    const reply = await fetch(`${base}/`, signalReachesBody ? init : { ...init, signal: null });
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  }) as typeof fetch;
}

describe("a Flow model call whose reply never finishes", () => {
  it("ends at its deadline as a retryable timeout, and the step log says so when it ends", async () => {
    await expectEndedAtDeadline(localFetch(true));
  }, DEADLINE_MS + 10_000);

  // What the chat attempt in A8 wave 4 met: the signal fired and never reached
  // the body. The race above the adapter ended the call; until t613 the
  // adapter itself read on, and its step never got a meta.json.
  it("ends at its deadline even when the signal does not reach the transport's body", async () => {
    await expectEndedAtDeadline(localFetch(false));
  }, DEADLINE_MS + 10_000);
});

async function expectEndedAtDeadline(fetchImpl: typeof fetch): Promise<void> {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => FAKE_SECRET,
    fetchImpl
  });
  const started = Date.now();
  const outcome = await automationStudioLlmProviderCall({ provider, request: decisionRequest(), now: Date.now, ledger: new AutomationStudioLlmProviderRetryLedger() });
  const elapsedMs = Date.now() - started;

  expect(elapsedMs).toBeLessThan(DEADLINE_MS + 1_000);
  expect(outcome.ok).toBe(false);
  expect(outcome.ok === false && outcome.failure).toMatchObject({ code: "llm.provider_timeout", retryable: true });
  // Timed out is temporary, and the one temporary fault the loop leaves to the evidence loop above it (`../decision.ts`).
  expect(outcome.retry.stop).toBe("not_retryable");
  expect(outcome.retry.attempts).toHaveLength(1);

  // The adapter itself ended, not only the race above it: its step is complete, with the code.
  const steps = readdirSync(stepDirectory).filter((name) => /^\d{4}-/u.test(name));
  expect(steps).toHaveLength(1);
  const meta = JSON.parse(readFileSync(path.join(stepDirectory, steps[0]!, "meta.json"), "utf8")) as { ms: number; status: string; error: { code: string } | null };
  expect(meta).toMatchObject({ status: "error", error: { code: "llm.provider_timeout" } });
  expect(meta.ms).toBeLessThan(DEADLINE_MS + 1_000);
}

function decisionRequest(): AutomationStudioLlmTaskRequest {
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    requestId: "request.stalled",
    idempotencyKey: "request.stalled",
    timeoutMs: DEADLINE_MS,
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
      evidenceLoop: { iteration: 1, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true), completionSchema, canComplete: true }
    }
  };
}
