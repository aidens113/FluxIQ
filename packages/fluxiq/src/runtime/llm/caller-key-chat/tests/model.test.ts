import { describe, expect, it, vi } from "vitest";
import { AutomationStudioModelAccessError, AutomationStudioModelAccessLedger, type AutomationStudioSessionKeyPorts, type AutomationStudioSessionKeySummary } from "../../../models/secrets/index.ts";
import { createAutomationStudioCallerKeyChatModel } from "../model.ts";

const VALUE = "synthetic-key-value";
const caller = { userId: "u1", sessionId: "session.1" };
const request = { instructions: "Answer with one JSON object.", transcript: [], message: "hello", correction: null };

function ports(keys: AutomationStudioSessionKeySummary[], options: { refuseRelease?: Error } = {}): AutomationStudioSessionKeyPorts {
  return {
    snapshot: async () => ({ keys }),
    createUseAuthorization: async (input) => {
      if (options.refuseRelease) throw options.refuseRelease;
      const key = keys.find((entry) => entry.id === input.id)!;
      return { authorizationId: "auth.1", keyId: key.id, keyUpdatedAtMs: key.updatedAtMs };
    },
    revealKeyWithAuthorization: async () => ({ value: VALUE }),
    revokeRevealAuthorization: () => undefined
  };
}

const anthropic: AutomationStudioSessionKeySummary = { id: "claude", name: "Claude", kind: "llm", provider: "Anthropic", enabled: true, updatedAtMs: 1, createdBy: "u1" };
const deepseek: AutomationStudioSessionKeySummary = { id: "deep", name: "Deep", kind: "llm", provider: "DeepSeek", enabled: true, updatedAtMs: 1, createdBy: "u1" };

async function decide(keys: AutomationStudioSessionKeySummary[], fetchImpl: typeof fetch, options: { refuseRelease?: Error; ledger?: AutomationStudioModelAccessLedger } = {}) {
  const ledger = options.ledger ?? new AutomationStudioModelAccessLedger();
  const model = createAutomationStudioCallerKeyChatModel({ ports: ports(keys, options), ledger, fetchImpl });
  return await model.decide(request, { signal: new AbortController().signal, caller }).then((answer) => ({ answer, ledger }), (error: unknown) => ({ error, ledger }));
}

const refused = vi.fn(async () => new Response(JSON.stringify({ error: { type: "authentication_error", message: "invalid key" } }), { status: 401, headers: { "content-type": "application/json" } }));

describe("the chat model chooses the sender's key, and so its provider, per call", () => {
  it("sends with a saved Anthropic key to Anthropic and names the refusal as the person's model access", async () => {
    refused.mockClear();
    const { error, ledger } = await decide([anthropic], refused as unknown as typeof fetch) as { error: AutomationStudioModelAccessError; ledger: AutomationStudioModelAccessLedger };
    expect(String((refused.mock.calls[0] as unknown[] | undefined)?.[0])).toMatch(/^https:\/\/api\.anthropic\.com\//u);
    expect(error).toBeInstanceOf(AutomationStudioModelAccessError);
    expect(error.access).toMatchObject({ status: "provider_refused", key: { id: "claude", provider: "anthropic" }, lastCall: { outcome: "provider_refused" } });
    expect(error.retryable).toBe(false);
    expect(ledger.lastCall(anthropic)?.outcome).toBe("provider_refused");
  });

  it("records a balance refusal as no credit, not a refused key", async () => {
    const empty = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402, headers: { "content-type": "application/json" } }));
    const { error, ledger } = await decide([deepseek], empty as unknown as typeof fetch) as { error: AutomationStudioModelAccessError; ledger: AutomationStudioModelAccessLedger };
    expect(error.access).toMatchObject({ status: "no_credit", message: expect.stringMatching(/says the account behind Deep has no credit left/u), lastCall: { outcome: "no_credit" } });
    expect(ledger.lastCall(deepseek)?.outcome).toBe("no_credit");
    const low = vi.fn(async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400, headers: { "content-type": "application/json" } }));
    const second = await decide([anthropic], low as unknown as typeof fetch) as { error: AutomationStudioModelAccessError };
    expect(second.error.access.status).toBe("no_credit");
  });

  it("sends with a saved DeepSeek key to DeepSeek and notes an answer", async () => {
    const answered = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"reply\":\"hi\"}" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } }));
    const { answer, ledger } = await decide([deepseek], answered as unknown as typeof fetch) as { answer: unknown; ledger: AutomationStudioModelAccessLedger };
    expect(String((answered.mock.calls[0] as unknown[] | undefined)?.[0])).toMatch(/deepseek/u);
    expect(answer).toBe("{\"reply\":\"hi\"}");
    expect(ledger.lastCall(deepseek)?.outcome).toBe("answered");
  });

  it("says a key this server cannot open, without calling a provider", async () => {
    const fetchImpl = vi.fn();
    const { error } = await decide([anthropic], fetchImpl as unknown as typeof fetch, { refuseRelease: Object.assign(new Error("sealed"), { code: "ciphertext_invalid" }) }) as { error: AutomationStudioModelAccessError };
    expect(error.access).toMatchObject({ status: "key_unopenable", unopenableCode: "ciphertext_invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says no key only when there is none", async () => {
    const fetchImpl = vi.fn();
    const { error } = await decide([], fetchImpl as unknown as typeof fetch) as { error: AutomationStudioModelAccessError };
    expect(error.access).toMatchObject({ status: "no_key", key: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("names a provider out of reach and lets the call be tried again", async () => {
    const offline = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const { error } = await decide([anthropic], offline as unknown as typeof fetch) as { error: AutomationStudioModelAccessError };
    expect(error.access).toMatchObject({ status: "provider_unreachable", message: expect.stringMatching(/could not be reached/u) });
    expect(error.retryable).toBe(true);
  });
});
