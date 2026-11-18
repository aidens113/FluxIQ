// @fluxiq-test-group real-sql
// A chat turn reads the person's message with the key they saved, whatever its
// provider, through the host's real composition (t924). The key and passwords
// are synthetic; every provider call goes to a stubbed `fetch` and is refused.
//
// The defect this guards: the host bound the chat to the provider of the
// process-wide default model (DeepSeek unless `FLUXIQ_LLM_DEFAULT_MODEL` said
// otherwise), so a saved Anthropic key was never looked at and every chat was
// answered "No model key is set up yet" with no provider call.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalProgramRuntime } from "../../index.ts";
import { RuntimeAccessFixture } from "./runtime-access-fixture.ts";

const NO_KEY_REPLY = "No model key is set up yet, so add one in Settings, under AI keys.";

let fixture: RuntimeAccessFixture;
let requests: string[];
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  requests = [];
  // The provider refuses the key, as Anthropic does a made-up one.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    requests.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json" } });
  }));
  fixture = await RuntimeAccessFixture.create();
  // Projects and their chats live in the v2 layout's SQL stores.
  await mkdir(path.join(fixture.root, ".fluxiq"), { recursive: true });
  await writeFile(path.join(fixture.root, ".fluxiq", "config.json"), JSON.stringify({ layoutVersion: 2 }));
});
afterEach(async () => {
  try {
    await fixture.dispose();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

async function chat(runtime: GlobalProgramRuntime, caller: { userId: string; sessionId: string }, text: string) {
  const project = await runtime.automationStudio.createProject({ name: "Chat key" });
  const conversation = await runtime.automationStudio.conversations.openConversation({ projectId: project.id, subject: { kind: "project", id: project.id }, title: null });
  const answer = await runtime.automationStudio.conversations.respondToPersonTurn({
    projectId: project.id, conversationId: conversation.conversationId, text,
    capabilities: [], flows: [], onScreen: {}, caller, limits: { attempts: 1, backoffMs: 0 }
  });
  const decision = answer.response?.decision;
  return { answer, reply: decision?.kind === "reply" ? decision.text : undefined };
}

describe("a chat turn uses the saved model key", () => {
  it("asks Anthropic with a saved Anthropic key from a panel session, and names the provider's refusal", async () => {
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(runtime);
    await fixture.createKey(runtime, login);
    const { reply, answer } = await chat(runtime, { userId: login.user.id, sessionId: login.session.id }, "What can you do on this page?");
    expect(reply).not.toBe(NO_KEY_REPLY);
    expect(requests.some((url) => url.startsWith("https://api.anthropic.com/"))).toBe(true);
    expect(answer.response?.modelProblem).toMatch(/refused the saved model key/u);
    // The same reason is the person's model-access state, which the panel and paired clients read.
    const actor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] };
    const snapshot = await runtime.api.call<unknown, { modelAccess?: { status: string; message: string; key: { provider: string } | null } }>({ programId: "secret-keys", endpoint: "snapshot", scope: {}, actor, payload: {} });
    expect(snapshot.ok && snapshot.payload?.modelAccess).toMatchObject({ status: "provider_refused", key: { provider: "anthropic" } });
    expect(snapshot.ok && snapshot.payload?.modelAccess?.message).toBe(reply);
  }, 120_000);

  it("asks Anthropic with the same key from a paired extension", async () => {
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(runtime);
    await fixture.createKey(runtime, login);
    const client = await fixture.pair(runtime, login);
    const caller = runtime.automationStudio.conversations.callerFor({ userId: login.user.id, sessionId: `client-gateway:${client.gatewaySessionId}` });
    const { reply } = await chat(runtime, caller, "What can you do on this page?");
    expect(reply).not.toBe(NO_KEY_REPLY);
    expect(requests.some((url) => url.startsWith("https://api.anthropic.com/"))).toBe(true);
  }, 120_000);

  it("says no key is set up only when there is none, and asks no provider", async () => {
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(runtime);
    const { reply } = await chat(runtime, { userId: login.user.id, sessionId: login.session.id }, "What can you do on this page?");
    expect(reply).toBe(NO_KEY_REPLY);
    expect(requests).toEqual([]);
    const actor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] };
    const snapshot = await runtime.api.call<unknown, { modelAccess?: { status: string } }>({ programId: "secret-keys", endpoint: "snapshot", scope: {}, actor, payload: {} });
    expect(snapshot.ok && snapshot.payload?.modelAccess?.status).toBe("no_key");
  }, 120_000);
});
