// @fluxiq-test-group real-sql
// A person's model access through the host's real composition (t928): saving a key through the Secret Keys API
// runs the free check and pushes the result to the person's paired client and to the panel's change signal, with
// no timer; a recorded outcome is still read after a restart; and a Flow call by someone with no key of their own
// uses a key another person lent the workspace. Since t950 the check runs BEFORE the key is stored: a key the
// provider refuses is never stored and changes nobody's state, so the outcome a stored key can carry from its
// check is "unreachable". Keys and passwords are synthetic, and every provider call goes to a
// stubbed `fetch`.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewaySocket } from "../../../client-gateway/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../../runtime/llm/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../runtime/llm/harness/index.ts";
import type { GlobalProgramRuntime } from "../../index.ts";
import type { ProgramApiActor } from "../api.ts";
import { modelAccessLedgerStore } from "../model-access/index.ts";
import { RuntimeAccessFixture, runtimeClientMessage } from "./runtime-access-fixture.ts";

const SAVED_VALUE = "dummy-anthropic-key-for-push";
const LENT_VALUE = "dummy-deepseek-key-lent-to-workspace";
const BUILDER_PASSWORD = "dummy-builder-password-for-lent-key";

type Sent = { type: string; payload: any };
type Login = Awaited<ReturnType<RuntimeAccessFixture["signIn"]>>;

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: Sent[] = [];
  readonly raw: string[] = [];
  send(text: string): void {
    this.raw.push(text);
    this.sent.push(JSON.parse(text) as Sent);
  }
}

let fixture: RuntimeAccessFixture;
let requests: Array<{ url: string; authorization: string | null; apiKey: string | null }>;
/** How the stubbed Anthropic answers this test's checks: it refuses every key, or cannot be reached. */
let anthropic: "refuse" | "unreachable" = "refuse";
/** How the stubbed provider answers: Anthropic as `anthropic` says, DeepSeek a diagnosis. */
const provider = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init?.headers);
  requests.push({ url, authorization: headers.get("authorization"), apiKey: headers.get("x-api-key") });
  if (url.startsWith("https://api.anthropic.com/")) {
    if (anthropic === "unreachable") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "Fine." }) } }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
});

beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  requests = [];
  anthropic = "refuse";
  vi.stubGlobal("fetch", provider);
  fixture = await RuntimeAccessFixture.create();
  // Projects and their Flows live in the v2 layout's SQL stores.
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

const panelActor = (login: Login): ProgramApiActor => ({ sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions], channel: "panel" });

/** A browser the person pairs, whose socket records everything the gateway sends it. */
async function pairWithSocket(runtime: GlobalProgramRuntime, login: Login): Promise<RecordingSocket> {
  const socket = new RecordingSocket();
  const { sessionId } = runtime.clientGateway.connect({ socket });
  await runtime.clientGateway.receive(sessionId, runtimeClientMessage("client.hello", { clientId: "extension.push", clientType: "extension", name: "Chrome" }));
  const code = runtime.clientGateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === sessionId)?.pairingCode;
  if (!code) throw new Error("The browser did not request approval.");
  expect((await runtime.clientGateway.approvePairing(code, { approvedByUserId: login.user.id, approvedBySessionId: login.session.id }))?.status).toBe("ready");
  return socket;
}

const pushed = (socket: RecordingSocket) => socket.sent.filter((message) => message.type === "server.model_access_changed").map((message) => message.payload.modelAccess);

async function snapshotModelAccess(runtime: GlobalProgramRuntime, login: Login) {
  const snapshot = await runtime.api.call<unknown, { modelAccess?: { status: string; lastCall: { outcome: string } | null } }>({ programId: "secret-keys", endpoint: "snapshot", scope: {}, actor: panelActor(login), payload: {} });
  return snapshot.ok ? snapshot.payload?.modelAccess : undefined;
}

describe("a saved key's model access is pushed with no timer", () => {
  it("sends the free check's outcome to the person's paired client and tells the panel's signal, never with the key's id or value", async () => {
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(runtime);
    const socket = await pairWithSocket(runtime, login);
    let panelHeard = 0;
    runtime.modelAccessChanges.subscribe(() => { panelHeard += 1; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const sentAtPairing = pushed(socket).length;

    // A key Anthropic refuses is checked first and never stored: nobody's state changes, nothing new is sent.
    const refused = await runtime.api.call({ programId: "secret-keys", endpoint: "save-model-key", scope: {}, actor: panelActor(login), payload: { provider: "anthropic", value: SAVED_VALUE, name: "Work" } });
    expect(refused).toMatchObject({ ok: false, errorCode: "provider_refused" });
    expect(requests.some((request) => request.url.startsWith("https://api.anthropic.com/") && request.apiKey === SAVED_VALUE)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushed(socket)).toHaveLength(sentAtPairing);
    expect(await snapshotModelAccess(runtime, login)).toMatchObject({ status: "no_key" });

    // Anthropic out of reach: the key is saved, and that outcome is its last one.
    anthropic = "unreachable";
    const saved = await runtime.api.call({ programId: "secret-keys", endpoint: "save-model-key", scope: {}, actor: panelActor(login), payload: { provider: "anthropic", value: SAVED_VALUE, name: "Work" } });
    expect(saved.ok, saved.error).toBe(true);
    await vi.waitFor(() => expect(pushed(socket).at(-1)).toMatchObject({ status: "provider_unreachable", key: { name: "Work", provider: "anthropic" }, lastCall: { outcome: "provider_unreachable" } }));
    expect(panelHeard).toBeGreaterThan(0);
    for (const state of pushed(socket)) expect(state.key?.id).toBeUndefined();
    expect(socket.raw.join("\n")).not.toContain(SAVED_VALUE);
    // The panel reads the same state from the snapshot it is told to read again.
    expect(await snapshotModelAccess(runtime, login)).toMatchObject({ status: "provider_unreachable", lastCall: { outcome: "provider_unreachable" } });

    // Nothing that did not change is sent again, and a closed instance tells no one.
    const sentBefore = pushed(socket).length;
    runtime.clientGateway.modelAccessPush.publish();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushed(socket)).toHaveLength(sentBefore);
    const heardBefore = panelHeard;
    await fixture.close(runtime);
    expect(runtime.clientGateway.modelAccessPush.publish()).toBe(0);
    expect(panelHeard).toBe(heardBefore);
  }, 120_000);

  it("sends one state per save or replace of a key it cannot check, the checked one, never ready first", async () => {
    anthropic = "unreachable";
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(runtime);
    const socket = await pairWithSocket(runtime, login);
    // Whatever pairing sends is settled before the save, so everything after it is the save's.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const write = async (endpoint: string, payload: Record<string, unknown>) => {
      const before = pushed(socket).length;
      const answer = await runtime.api.call({ programId: "secret-keys", endpoint, scope: {}, actor: panelActor(login), payload });
      expect(answer.ok, answer.error).toBe(true);
      await vi.waitFor(() => expect(pushed(socket).length).toBeGreaterThan(before));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return pushed(socket).slice(before);
    };

    const afterSave = await write("save-model-key", { provider: "anthropic", value: SAVED_VALUE, name: "Work" });
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0]).toMatchObject({ status: "provider_unreachable", lastCall: { outcome: "provider_unreachable" } });

    const afterReplace = await write("replace-model-key", { value: `${SAVED_VALUE}-replaced` });
    expect(afterReplace).toHaveLength(1);
    expect(afterReplace[0]).toMatchObject({ status: "provider_unreachable", lastCall: { outcome: "provider_unreachable" } });
    expect(pushed(socket).some((state) => state.status === "ready")).toBe(false);
  }, 120_000);

  it("still reads the stored outcome after a restart, with no new check", async () => {
    anthropic = "unreachable";
    const first = fixture.boot({ modelProvidersEnabled: true });
    const login = await fixture.signIn(first);
    expect((await first.api.call({ programId: "secret-keys", endpoint: "save-model-key", scope: {}, actor: panelActor(login), payload: { provider: "anthropic", value: SAVED_VALUE } })).ok).toBe(true);
    expect(await snapshotModelAccess(first, login)).toMatchObject({ status: "provider_unreachable" });
    // The ledger writes behind the change; wait until the outcome is in the instance's store.
    const store = modelAccessLedgerStore(path.join(fixture.root, ".fluxiq", "data"));
    await vi.waitFor(async () => expect(JSON.stringify(await store.read())).toContain("provider_unreachable"));
    await fixture.close(first);

    requests = [];
    const second = fixture.boot({ modelProvidersEnabled: true });
    const again = await fixture.signIn(second);
    expect(await snapshotModelAccess(second, again)).toMatchObject({ status: "provider_unreachable", lastCall: { outcome: "provider_unreachable" } });
    expect(requests).toEqual([]);
  }, 120_000);
});

describe("a Flow call by someone with no key of their own", () => {
  it("uses the key another person lent the workspace, released as theirs, only while both consents hold", async () => {
    const runtime = fixture.boot({ modelProvidersEnabled: true });
    const holder = await fixture.signIn(runtime);
    const lent = await runtime.secretKeys.createKey({
      name: "Team", kind: "llm", provider: "DeepSeek", value: LENT_VALUE, createdBy: holder.user.id
    });
    await runtime.secretKeys.modelKeys.setOffered(lent.id, true, holder.user.id);
    await runtime.secretKeys.modelKeys.setAssistant({ keyId: lent.id, chosenBy: holder.user.id });
    await runtime.identityAccess.upsertUser({ id: "user.builder", username: "builder", displayName: "Builder", roleId: holder.role.id, password: BUILDER_PASSWORD });
    const builder = await fixture.signIn(runtime, "builder", BUILDER_PASSWORD);
    const project = await runtime.automationStudio.createProject({ name: "Lent key" });
    const flow = await runtime.automationStudio.createFlow({ projectId: project.id, name: "Uses the workspace key" });
    const resolve = (runtime.automationStudio as unknown as { llmProviderResolver: (input: AutomationStudioLlmProviderResolverInput) => Promise<AutomationStudioLlmProviderResolution | undefined> }).llmProviderResolver;
    const call = async () => {
      const resolution = await resolve({ projectId: project.id, flowId: flow.flowId, caller: { actorUserId: builder.user.id, actorSessionId: builder.session.id } });
      if (!resolution) throw new Error("No provider was resolved.");
      return await resolution.provider.runTask(taskRequest(project.id, flow.flowId));
    };

    await expect(call()).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(requests.filter((request) => request.url.startsWith("https://api.deepseek.com/")).map((request) => request.authorization)).toEqual([`Bearer ${LENT_VALUE}`]);

    // Its holder withdraws the offer: the next call no longer uses it.
    requests = [];
    await runtime.secretKeys.modelKeys.setOffered(lent.id, false, holder.user.id);
    await expect(call()).rejects.toThrow();
    expect(requests.some((request) => request.authorization === `Bearer ${LENT_VALUE}`)).toBe(false);
  }, 120_000);
});

function taskRequest(projectId: string, flowId: string): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.lent",
    idempotencyKey: "idempotency.lent",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId,
      flowId,
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    }
  };
}

