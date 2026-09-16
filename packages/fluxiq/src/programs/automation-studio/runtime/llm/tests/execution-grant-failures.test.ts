import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS, type AutomationStudioLlmExecutionGrantService } from "../execution-grants.ts";
import { issueInput, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

// What a failed call does to the grant it was made under.
//
// A call that failed on the model's reply or on the network is a spent call:
// it is counted and charged exactly as a successful one, and the grant carries
// on, so an iterating recovery survives one bad answer. A call that failed on
// the authorization -- the session, the key, the Flow, the grant's own state,
// the integrity of what was claimed or revealed, a request Core will never
// send, a budget that no longer holds -- still ends the grant on the spot.

type Fixture = ReturnType<typeof setup>;
type Issue = Parameters<AutomationStudioLlmExecutionGrantService["issue"]>[0];

/** A call's worst case in tokens under the default limits: min(10,000, 8,000 + 2,000). */
const WORST_CASE_TOKENS = 10_000;

describe("a failed call that only spent itself", () => {
  it.each([
    ["a reply that is not JSON", reply("not json"), "llm.provider_malformed_response"],
    ["an envelope that is not a completion", envelope(JSON.stringify({ choices: [] })), "llm.provider_malformed_response"],
    ["a reply that does not satisfy the requested structure", reply(JSON.stringify({ kind: "runtime_patch" })), "llm.provider_output_invalid"],
    ["a reply cut off at its output limit", reply("{\"kind\":\"diag", { finish: "length" }), "llm.provider_output_truncated"],
    ["a reply whose usage report does not add up", reply(JSON.stringify({ kind: "diagnosis", summary: "x" }), { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 5 } }), "llm.provider_usage_invalid"]
  ] as const)("leaves the grant usable after %s, charged as a spent call", async (_label, answer, code) => {
    const fixture = setup();
    const { grantId, provider } = await adapting(fixture);
    fixture.script.push(answer);

    await expect(provider.runTask(next())).rejects.toMatchObject({ code });
    expect(fixture.service.activeGrantCount()).toBe(1);
    // Counted, and charged its reserved cost and its worst case in tokens.
    expect(stored(fixture, grantId)).toMatchObject({ remainingUses: 25, callInFlight: false, committedEstimatedCostUsd: 0.25, committedTotalTokens: WORST_CASE_TOKENS });

    await expect(provider.runTask(next())).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(stored(fixture, grantId)).toMatchObject({ remainingUses: 24 });
    expect(fixture.revealCount).toBe(2);
    fixture.service.close();
  });

  it("leaves the grant usable after the provider does not answer in time", async () => {
    const fixture = setup();
    const { grantId, provider } = await adapting(fixture);
    fixture.script.push(hang);

    await expect(provider.runTask(next({ timeoutMs: 20 }))).rejects.toMatchObject({ code: "llm.provider_timeout" });
    expect(stored(fixture, grantId)).toMatchObject({ remainingUses: 25, callInFlight: false, committedTotalTokens: WORST_CASE_TOKENS });
    await expect(provider.runTask(next())).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(fixture.service.activeGrantCount()).toBe(1);
    fixture.service.close();
  });

  // The harness enforces each call's deadline by aborting the signal it hands
  // the provider, as a timeout. The grant settles that call at once: the
  // harness has already moved on, and its next call must find the grant free
  // rather than still "in progress".
  it("settles a call the moment the caller's deadline ends it, so the caller's next call goes through", async () => {
    const fixture = setup();
    const { grantId, provider } = await adapting(fixture);
    fixture.delayProvider = true;
    const deadline = new AbortController();
    const timedOut = provider.runTask(next(), { signal: deadline.signal });
    await fixture.providerStarted;

    deadline.abort(new DOMException("The call reached its deadline.", "TimeoutError"));
    expect(stored(fixture, grantId)).toMatchObject({ callInFlight: false, remainingUses: 25, committedTotalTokens: WORST_CASE_TOKENS });
    fixture.delayProvider = false;
    const following = provider.runTask(next());

    await expect(timedOut).rejects.toMatchObject({ code: "llm.provider_timeout" });
    await expect(following).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(fixture.service.activeGrantCount()).toBe(1);
    expect(stored(fixture, grantId)).toMatchObject({ remainingUses: 24 });
    fixture.service.close();
  });

  it.each([
    ["rate limited", envelope("{}", { status: 429 }), "llm.provider_rate_limited"],
    ["briefly unavailable", envelope("{}", { status: 503 }), "llm.provider_http_error"],
    ["unreachable", () => Promise.reject(new TypeError("fetch failed")), "llm.provider_network_error"]
  ] as const)("leaves the grant usable when the provider is %s", async (_label, answer, code) => {
    const fixture = setup();
    const { provider } = await adapting(fixture);
    fixture.script.push(answer);

    await expect(provider.runTask(next())).rejects.toMatchObject({ code });
    await expect(provider.runTask(next())).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(fixture.service.activeGrantCount()).toBe(1);
    fixture.service.close();
  });

  // Spent calls are still calls: a grant whose last use went on a bad reply is
  // consumed, exactly as if the reply had been good.
  it("consumes a grant whose last call was spent on a bad reply", async () => {
    const fixture = setup();
    const { provider } = await adapting(fixture, { maxCalls: 2, maxUses: 2 });
    fixture.script.push(reply("not json"), reply("not json"));

    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    expect(fixture.service.activeGrantCount()).toBe(1);
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    expect(fixture.service.activeGrantCount()).toBe(0);
    await expect(provider.runTask(next())).rejects.toThrow("unavailable");
    expect(fixture.revealCount).toBe(2);
  });
});

describe("a failed call that ends the grant", () => {
  // Property: a grant never outlives the person who authorized it.
  it("ends the grant when the actor's session or Secret Keys unlock is gone, including during a spent call", async () => {
    let fixture = setup();
    let { provider } = await adapting(fixture);
    fixture.sessionValid = false;
    await expect(provider.runTask(next())).rejects.toThrow("no longer valid");
    expect(fixture.service.activeGrantCount()).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture, { ttlMs: 1_000 }));
    fixture.now = 5_000;
    fixture.sessionUnlocked = false;
    await expect(provider.runTask(next())).rejects.toThrow("session unlock is unavailable");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);

    // A bad reply does not shield a grant whose session ended while it was out.
    const during = setup();
    ({ provider } = await adapting(during));
    during.script.push((() => { during.sessionValid = false; return reply("not json")(); }));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    expect(during.service.activeGrantCount()).toBe(0);
  });

  // Property: a grant only ever reveals the key version the person authorized,
  // and a key the provider rejects is not tried again.
  it("ends the grant when its key changed, was disabled, or was rejected by the provider", async () => {
    for (const change of [(fixture: Fixture) => { fixture.key.updatedAtMs += 1; }, (fixture: Fixture) => { fixture.key.enabled = false; }]) {
      const fixture = setup();
      const { provider } = await adapting(fixture);
      change(fixture);
      await expect(provider.runTask(next())).rejects.toThrow("no longer valid");
      expect(fixture.service.activeGrantCount()).toBe(0);
      expect(fixture.revealCount).toBe(0);
    }
    const fixture = setup();
    const { provider } = await adapting(fixture);
    fixture.script.push(envelope("{}", { status: 401 }));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_auth_failed" });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  // Property: a grant only authorizes calls about the exact Flow revision it was issued for.
  it("ends the grant when the Flow or its settings revision changed", async () => {
    for (const change of [(fixture: Fixture) => { fixture.settingsRevision += 1; }, (fixture: Fixture) => { fixture.executionDigest = "execution-digest.changed"; }]) {
      const fixture = setup();
      const { provider } = await adapting(fixture);
      change(fixture);
      await expect(provider.runTask(next())).rejects.toThrow("no longer valid");
      expect(fixture.service.activeGrantCount()).toBe(0);
    }
  });

  // Property: revocation and cancellation are final. Only a deadline is a spent call.
  it("ends the grant when it is revoked, or when the caller cancels rather than times out", async () => {
    let fixture = setup();
    const revoked = await adapting(fixture);
    fixture.service.revoke(revoked.grantId);
    await expect(revoked.provider.runTask(next())).rejects.toThrow("unavailable");
    expect(fixture.revealCount).toBe(0);

    fixture = setup();
    const { provider } = await adapting(fixture);
    fixture.delayProvider = true;
    const cancel = new AbortController();
    const pending = provider.runTask(next(), { signal: cancel.signal });
    await fixture.providerStarted;
    cancel.abort();
    expect(fixture.service.activeGrantCount()).toBe(0);
    await expect(pending).rejects.toMatchObject({ code: "llm.provider_aborted" });

    fixture = setup();
    const already = await adapting(fixture);
    await expect(already.provider.runTask(next(), { signal: AbortSignal.abort() })).rejects.toThrow("cancelled");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  // A deadline that falls inside the grant's own authorization steps is not a
  // provider timeout: those steps' outcome is unknown, so the grant ends.
  it("ends the grant when a deadline falls before the credential was released", async () => {
    const fixture = setup();
    const { provider } = await adapting(fixture);
    fixture.delayReveal = true;
    const deadline = new AbortController();
    const pending = provider.runTask(next(), { signal: deadline.signal });
    await fixture.revealStarted;
    deadline.abort(new DOMException("The call reached its deadline.", "TimeoutError"));
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.releaseReveal();
    await expect(pending).rejects.toThrow();
  });

  // Property: a claimed grant cannot run past its run lease, and a spent call does not extend it.
  it("ends the grant when its run lease is over, even for a call that only spent itself", async () => {
    const fixture = setup();
    let { provider } = await adapting(fixture);
    fixture.now = 1 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    await expect(provider.runTask(next())).rejects.toThrow("unavailable");
    expect(fixture.service.activeGrantCount()).toBe(0);

    const late = setup();
    ({ provider } = await adapting(late));
    late.script.push(() => { late.now = 1 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS; return reply("not json")(); });
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    expect(late.service.activeGrantCount()).toBe(0);
  });

  // Property: a call can only be what the grant authorized, reveals stay one
  // for one with calls and with the authorized key, and the credential only
  // ever goes to the fixed endpoint.
  it("ends the grant on a claim, exchange, reveal or endpoint integrity failure", async () => {
    let fixture = setup();
    let { provider } = await adapting(fixture);
    await expect(provider.runTask(next({ taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" }))).rejects.toThrow("request mismatch");
    expect(fixture.service.activeGrantCount()).toBe(0);

    // The scope a grant was claimed for, changed underneath it.
    fixture = setup();
    fixture.exactBinding = true;
    const issued = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt" });
    const scope = { ...resolveInput(issued.grantId), purpose: "diagnose_and_adapt" as const };
    ({ provider } = await fixture.service.resolve(scope));
    scope.flowId = "flow.other";
    await expect(provider.runTask(next())).rejects.toThrow("scope mismatch");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture, { ttlMs: 1_000 }));
    fixture.now = 5_000;
    const exchangeKeys = secretKeysOf(fixture);
    const mint = exchangeKeys.createSessionRevealAuthorization;
    exchangeKeys.createSessionRevealAuthorization = async (input: unknown) => ({ ...(await mint(input)), keyUpdatedAtMs: 99 });
    await expect(provider.runTask(next())).rejects.toThrow("key changed");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture));
    const revealKeys = secretKeysOf(fixture);
    const reveal = revealKeys.revealKeyWithAuthorization;
    revealKeys.revealKeyWithAuthorization = async (input: unknown) => {
      const revealed = await reveal(input);
      return { ...revealed, key: { ...revealed.key, updatedAtMs: 99 } };
    };
    // The credential gate revokes the grant as it refuses, which aborts the call,
    // so the call itself ends as cancelled.
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_aborted" });
    expect(fixture.service.activeGrantCount()).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture));
    fixture.script.push(envelope("", { status: 302, headers: { location: "https://elsewhere.example.test/" } }));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_redirect_rejected" });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  // Property: a request Core refuses to send is refused identically next time,
  // and a credential found in the outbound body is an exfiltration signal.
  it("ends the grant on a pre-send refusal, before the request leaves the process", async () => {
    let fixture = setup();
    let { provider } = await adapting(fixture);
    await expect(provider.runTask(next({ requestId: "not a valid id" }))).rejects.toMatchObject({ code: "llm.provider_request_identity_invalid" });
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture));
    const unsent = () => { throw new Error("The request was sent."); };
    fixture.script.push(unsent);
    const leaking = next();
    leaking.context = { ...leaking.context, instructions: { ...leaking.context.instructions, diagnostics: [{ severity: "info", code: "note", message: "test-secret" }] } };
    await expect(provider.runTask(leaking)).rejects.toMatchObject({ code: "llm.provider_aborted" });
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.script).toEqual([unsent]);
  });

  // Property: a status other than 5xx or 429 is the provider refusing this
  // request, which asking again will not change.
  it("ends the grant when the provider refuses the request outright", async () => {
    const fixture = setup();
    const { provider } = await adapting(fixture);
    fixture.script.push(envelope("{}", { status: 400 }));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_http_error", status: 400 });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  // Property: the grant's spending bound. A provider that bills past a call's
  // ceiling ends it, and spent calls are charged against the run's token and
  // cost totals, so bad replies cannot outrun them.
  it("ends the grant on a budget breach, with spent calls counted towards it", async () => {
    let fixture = setup();
    let { provider } = await adapting(fixture);
    fixture.usage = { prompt_tokens: 9_000, completion_tokens: 1, total_tokens: 9_001 };
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_usage_limit_exceeded" });
    expect(fixture.service.activeGrantCount()).toBe(0);

    fixture = setup();
    ({ provider } = await adapting(fixture, { maxTotalTokensPerRun: 25_000 }));
    fixture.script.push(reply("not json"), reply("not json"));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    // 20,000 charged, and the next call could use 10,000.
    await expect(provider.runTask(next())).rejects.toThrow("total token limit");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(2);

    fixture = setup();
    ({ provider } = await adapting(fixture, { maxTotalEstimatedCostUsd: 0.5 }));
    fixture.script.push(reply("not json"), reply("not json"));
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    await expect(provider.runTask(next())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    await expect(provider.runTask(next())).rejects.toThrow("total estimated-cost limit");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });
});

/** An adapting grant, claimed, with its granted provider. */
async function adapting(fixture: Fixture, limits: Partial<Issue> = {}) {
  fixture.exactBinding = true;
  const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", ...limits });
  const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
  return { grantId: grant.grantId, provider: resolved.provider };
}

function stored(fixture: Fixture, grantId: string): Record<string, unknown> {
  return (fixture.service as unknown as { grants: Map<string, Record<string, unknown>> }).grants.get(grantId) ?? {};
}

/** The grant's Secret Keys stand-in, so a case can swap one of its answers. */
type SecretKeysStandIn = {
  createSessionRevealAuthorization: (input: unknown) => Promise<Record<string, unknown>>;
  revealKeyWithAuthorization: (input: unknown) => Promise<{ key: Record<string, unknown>; value: string }>;
};

function secretKeysOf(fixture: Fixture): SecretKeysStandIn {
  return (fixture.service as unknown as { options: { secretKeys: SecretKeysStandIn } }).options.secretKeys;
}

let sequence = 0;

function next(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  sequence += 1;
  return { ...request(), requestId: `request.failure.${sequence}`, idempotencyKey: `request.failure.${sequence}`, ...overrides };
}

/** A scripted HTTP answer with this body and status. */
function envelope(body: string, init: { status?: number; headers?: Record<string, string> } = {}): () => Response {
  return () => new Response(body, { status: init.status ?? 200, headers: { "content-type": "application/json", ...init.headers } });
}

/** A completion whose message content is `content`, verbatim. */
function reply(content: string, options: { finish?: string; usage?: Record<string, number> } = {}): () => Response {
  return envelope(JSON.stringify({
    choices: [{ finish_reason: options.finish ?? "stop", message: { content } }],
    usage: options.usage ?? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  }));
}

/** An endpoint that never answers, and gives up only when the call is aborted. */
function hang(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")), { once: true });
  });
}
