// The chat window's DeepSeek call, refused with a 500 whose body never
// finishes, ends at its deadline with its step log written (t617).
//
// DeepSeek can send a status and headers and then blank lines while a request
// waits in its queue. The Flow-build adapter read such a refusal body with no
// signal (`../refusal.ts`); this pins the chat call's half of the same path,
// which reads every body, success or refusal, under the call's signal. The
// model's `fetchImpl` sends DeepSeek's request to a local HTTP server that
// answers 500 and then a blank line every 100 ms. No real provider is called;
// the key is a fixed fake.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, createAutomationStudioDeepSeekPanelCommandModel } from "../index.ts";

const DEADLINE_MS = 1_500;
const FAKE_KEY = "sk-local-test-only-0000";
const REQUEST = { instructions: "You can operate the FluxIQ control panel.", transcript: [], message: "hello", correction: null };

let server: http.Server;
let base = "";
let stepDirectory = "";
const open = new Set<http.ServerResponse>();

beforeAll(async () => {
  server = http.createServer((request, response) => {
    request.resume();
    open.add(response);
    response.writeHead(500, { "content-type": "application/json" });
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
  stepDirectory = mkdtempSync(path.join(tmpdir(), "fluxiq-stalled-refusal-steps-"));
  vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", stepDirectory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(stepDirectory, { recursive: true, force: true });
});

/** DeepSeek's request, sent to the local server instead; any other address is refused. */
function localFetch(signalReachesBody: boolean): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL) throw new Error(`This test sends only DeepSeek's request, never ${String(input)}.`);
    return await fetch(`${base}/`, signalReachesBody ? init : { ...init, signal: null });
  }) as typeof fetch;
}

describe("a chat call refused with a 500 whose body never finishes", () => {
  it("ends at its deadline as a retryable timeout, and the step log says so when it ends", async () => {
    await expectEndedAtDeadline(localFetch(true));
  }, DEADLINE_MS + 10_000);

  it("ends at its deadline even when the signal does not reach the transport's body", async () => {
    await expectEndedAtDeadline(localFetch(false));
  }, DEADLINE_MS + 10_000);
});

async function expectEndedAtDeadline(fetchImpl: typeof fetch): Promise<void> {
  const model = createAutomationStudioDeepSeekPanelCommandModel({ resolveKey: async () => FAKE_KEY, fetchImpl });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), DEADLINE_MS);
  const started = Date.now();
  try {
    await expect(model.decide(REQUEST, { signal: controller.signal, caller: null })).rejects.toMatchObject({ code: "llm.provider_timeout", retryable: true });
  } finally {
    clearTimeout(timer);
  }
  expect(Date.now() - started).toBeLessThan(DEADLINE_MS + 1_000);

  const steps = readdirSync(stepDirectory).filter((name) => /^\d{4}-/u.test(name));
  expect(steps).toHaveLength(1);
  const meta = JSON.parse(readFileSync(path.join(stepDirectory, steps[0]!, "meta.json"), "utf8")) as { ms: number; status: string; error: { code: string } | null };
  expect(meta).toMatchObject({ status: "error", error: { code: "llm.provider_timeout" } });
  expect(meta.ms).toBeLessThan(DEADLINE_MS + 1_000);
}
