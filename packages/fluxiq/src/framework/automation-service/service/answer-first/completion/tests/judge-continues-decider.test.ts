// @fluxiq-test-group real-sql
// t971: the judge after a decision continues its own attempt's decider conversation on the path a chat starts: the
// service's answer-first generation with a caller (`generateFlowBootstrapAdaptation`, which `lab attempt` and the
// extension's chat reach), through the real harness and the real Anthropic adapter, with only the fetch scripted.
//
// Live run run-mwoq9g4l-dbd69bd6: every judge said `no_attempt_key`. t967 stamped the attempt's key on the request in
// the routing provider's `runTask`, which a harness call never goes through (it calls the serving model's provider
// directly), so neither the decider's request nor the judge's had a key. The adapter now reads the key from the
// attempt's own frame as the call is sent (`runtime/llm/role-routing/ladder/attempt-key.ts`).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { createAutomationStudioAnthropicProvider } from "../../../../../../runtime/llm/anthropic/index.ts";
import { complete, judgedYes, READ_LOANS, runNode, scriptedAttempt } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const MODEL = "claude-haiku-5-5";
type Wire = { messages: { role: string; content: unknown }[]; output_config: { format: { schema: { properties?: Record<string, unknown> } } } };

/**
 * The real Anthropic adapter in place of the scripted model: each request the harness sends it goes on to Anthropic's
 * wire, and the scripted model (`scripted`) writes the reply the wire returns, in the format the wire asked for.
 */
function throughTheAdapter(scripted: AutomationStudioLlmProvider, bodies: Wire[]): AutomationStudioLlmProvider {
  let asked: AutomationStudioLlmTaskRequest | undefined;
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Wire;
    bodies.push(body);
    const reply = await scripted.runTask(asked!);
    const value = (reply as { response: unknown }).response;
    const text = body.output_config.format.schema.properties?.result_json ? JSON.stringify({ result_json: JSON.stringify(value) }) : JSON.stringify(value);
    const envelope = { id: `msg_${bodies.length}`, type: "message", role: "assistant", model: MODEL, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } });
  });
  const adapter = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch, model: MODEL });
  return {
    metadata: adapter.metadata,
    ...(adapter.measureInput ? { measureInput: adapter.measureInput } : {}),
    ...(adapter.estimateCostUsd ? { estimateCostUsd: adapter.estimateCostUsd } : {}),
    runTask: async (request, execution) => {
      asked = request;
      return await adapter.runTask(request, execution);
    }
  };
}

describe("an attempt started the way a chat starts it", () => {
  it("sends the judge after a decision as a continuation of its own decider, and its step says so", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t971-step-log-"));
    const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    const bodies: Wire[] = [];
    try {
      const attempt = await scriptedAttempt({
        taskProcessing: { process: {} },
        instruction: "List every loan on my library account.",
        script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")],
        // Through the adapter the judge's reply meets the wire's own schema, which requires every field a real model's
        // constrained output carries, defects included (empty on a yes). Without it each yes is unreadable and asked again.
        judge: [(request: AutomationStudioLlmTaskRequest) => judgedYes(request, { defects: [] })],
        wrapProvider: (scripted) => throughTheAdapter(scripted, bodies)
      }, cleanups);
      expect(attempt.answered).toMatchObject({ status: "answered", attempt: { status: "achieved" } });
      expect(attempt.hung).toBe(false);
      const judges = readdirSync(directory).filter((folder) => folder.endsWith("-judge")).sort().map((folder) => JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { continuation?: unknown });
      expect(judges.length).toBeGreaterThan(0);
      expect(judges[0]!.continuation).toEqual({ used: true, reason: "continues_the_decider" });
      // On the wire: the decider's turn, then the judge's own instructions as a system message, last.
      const judged = bodies.find((body) => body.messages.some((message) => message.role === "system"));
      expect(judged).toBeDefined();
      expect(judged!.messages.at(-1)).toMatchObject({ role: "system" });
    } finally {
      if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
