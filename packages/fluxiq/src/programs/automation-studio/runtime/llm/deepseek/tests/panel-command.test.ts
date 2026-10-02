// The chat window's DeepSeek call and the key it is released, with a fake
// fetch and fake Secret Keys ports. The real provider is exercised by the
// live script recorded in the chat-plain-requests report, not here.

import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, automationStudioPanelCommandKeyFromSecretKeys, createAutomationStudioDeepSeekPanelCommandModel, estimateAutomationStudioDeepSeekCostUsd } from "../index.ts";

const KEY = "sk-test-0123456789abcdef";
const REQUEST = {
  instructions: "You can operate the FluxIQ control panel.",
  transcript: [{ author: "person" as const, text: "hello" }, { author: "panel" as const, text: "Ran the Flow." }],
  message: "run my kettle flow",
  correction: null
};

function reply(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function modelWith(fetchImpl: typeof fetch, resolveKey = async () => KEY) {
  return createAutomationStudioDeepSeekPanelCommandModel({ resolveKey, fetchImpl });
}

const execution = () => ({ signal: new AbortController().signal, caller: { userId: "user.1", sessionId: "session.1" } });

describe("the chat window's DeepSeek call", () => {
  it("sends the instructions, the thread and the message in JSON mode, and returns the model's own words", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(200, { choices: [{ message: { content: '{"do": "run.execute"}' } }] }));
    const answer = await modelWith(fetchImpl as unknown as typeof fetch).decide(REQUEST, execution());

    expect(answer).toBe('{"do": "run.execute"}');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
    expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ model: "deepseek-flash", temperature: 0, response_format: { type: "json_object" }, thinking: { type: "disabled" }, stream: false });
    expect(body.messages).toEqual([
      { role: "system", content: REQUEST.instructions },
      { role: "user", content: "hello" },
      { role: "assistant", content: "[The panel reported] Ran the Flow." },
      { role: "user", content: "run my kettle flow" }
    ]);
    expect(String(init!.body)).not.toContain(KEY);
  });

  it("refuses to send a message that would carry the key, without calling DeepSeek", async () => {
    const fetchImpl = vi.fn();
    await expect(modelWith(fetchImpl as unknown as typeof fetch).decide({ ...REQUEST, message: `my key is ${KEY}` }, execution()))
      .rejects.toMatchObject({ code: "llm.provider_credential_in_request", retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says which failures are worth retrying", async () => {
    const failing = (status: number) => modelWith((async () => reply(status, "{}")) as unknown as typeof fetch).decide(REQUEST, execution());
    await expect(failing(401)).rejects.toMatchObject({ code: "llm.provider_auth_failed", retryable: false });
    await expect(failing(429)).rejects.toMatchObject({ code: "llm.provider_rate_limited", retryable: true });
    await expect(failing(503)).rejects.toMatchObject({ code: "llm.provider_http_error", retryable: true });
    await expect(failing(400)).rejects.toMatchObject({ code: "llm.provider_http_error", retryable: false });
    const empty = modelWith((async () => reply(200, { choices: [{ message: { content: "" } }] })) as unknown as typeof fetch).decide(REQUEST, execution());
    await expect(empty).rejects.toMatchObject({ code: "llm.provider_malformed_response", retryable: true });
    const unreachable = modelWith((async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch).decide(REQUEST, execution());
    await expect(unreachable).rejects.toMatchObject({ code: "llm.provider_network_error", retryable: true });
  });

  // The call that decides to build a Flow is part of that Flow's cost (t234 W9):
  // the conversation is told what each reply cost, priced as the step log
  // prices it, and carries it into the build's creation purse.
  it("tells the conversation what a reply cost, priced from its usage, even when the reply cannot be used", async () => {
    const usage = { prompt_tokens: 1_200, completion_tokens: 40, total_tokens: 1_240, prompt_cache_hit_tokens: 1_000, prompt_cache_miss_tokens: 200 };
    const expected = estimateAutomationStudioDeepSeekCostUsd(1_200, 40, 1_000, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
    expect(expected).toBeGreaterThan(0);

    const paid = vi.fn();
    const answer = await modelWith((async () => reply(200, { choices: [{ message: { content: '{"do": "flow.createHere"}' } }], usage })) as unknown as typeof fetch)
      .decide(REQUEST, { ...execution(), paid });
    expect(answer).toBe('{"do": "flow.createHere"}');
    expect(paid).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledWith(expected);

    // An empty answer was still paid for.
    const paidForEmpty = vi.fn();
    await expect(modelWith((async () => reply(200, { choices: [{ message: { content: "" } }], usage })) as unknown as typeof fetch).decide(REQUEST, { ...execution(), paid: paidForEmpty }))
      .rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    expect(paidForEmpty).toHaveBeenCalledWith(expected);

    // A reply with no usage, or counts the pricing refuses, is unpriced: nothing is told.
    const unpriced = vi.fn();
    await modelWith((async () => reply(200, { choices: [{ message: { content: "{}" } }] })) as unknown as typeof fetch).decide(REQUEST, { ...execution(), paid: unpriced });
    await modelWith((async () => reply(200, { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: -1, completion_tokens: 4 } })) as unknown as typeof fetch).decide(REQUEST, { ...execution(), paid: unpriced });
    expect(unpriced).not.toHaveBeenCalled();

    // A model with no one to tell still answers.
    await expect(modelWith((async () => reply(200, { choices: [{ message: { content: "{}" } }], usage })) as unknown as typeof fetch).decide(REQUEST, execution())).resolves.toBe("{}");
  });

  it("does not retry when no key can be released, and says so without the key", async () => {
    const locked = modelWith(vi.fn() as unknown as typeof fetch, async () => { throw new Error("Secret key session unlock is unavailable"); });
    await expect(locked.decide(REQUEST, execution())).rejects.toMatchObject({ code: "llm.provider_secret_unavailable", retryable: false });
  });
});

describe("the key the chat window's call is released", () => {
  function ports(overrides: Record<string, unknown> = {}) {
    return {
      snapshot: vi.fn(async () => ({ keys: [
        { id: "key.openai", kind: "llm", provider: "openai", enabled: true, updatedAtMs: 30 },
        { id: "key.off", kind: "llm", provider: "deepseek", enabled: false, updatedAtMs: 20 },
        { id: "key.deepseek", kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 10 }
      ] })),
      createSessionRevealAuthorization: vi.fn(async (input: { id: string }) => ({ authorizationId: "auth.1", keyId: input.id, keyUpdatedAtMs: 10 })),
      revealKeyWithAuthorization: vi.fn(async () => ({ value: KEY })),
      revokeRevealAuthorization: vi.fn(),
      ...overrides
    };
  }

  it("releases the newest enabled DeepSeek key to the caller's own unlocked session", async () => {
    const keys = ports();
    await expect(automationStudioPanelCommandKeyFromSecretKeys(keys)({ userId: "user.1", sessionId: "session.1" })).resolves.toBe(KEY);
    expect(keys.createSessionRevealAuthorization).toHaveBeenCalledWith({ id: "key.deepseek", sessionId: "session.1", userId: "user.1", ttlMs: 10_000 });
  });

  it("releases nothing with no caller, and revokes a reveal for a key that changed underneath it", async () => {
    await expect(automationStudioPanelCommandKeyFromSecretKeys(ports())(null)).rejects.toThrow("No signed-in person");
    const changed = ports({ createSessionRevealAuthorization: vi.fn(async () => ({ authorizationId: "auth.2", keyId: "key.deepseek", keyUpdatedAtMs: 99 })) });
    await expect(automationStudioPanelCommandKeyFromSecretKeys(changed)({ userId: "user.1", sessionId: "session.1" })).rejects.toThrow("changed");
    expect(changed.revokeRevealAuthorization).toHaveBeenCalledWith("auth.2");
    expect(changed.revealKeyWithAuthorization).not.toHaveBeenCalled();
  });
});
