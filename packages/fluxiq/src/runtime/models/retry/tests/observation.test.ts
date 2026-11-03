import { expect, it } from "vitest";
import { createExecutionAdmissionAuthority } from "../../../execution-admission/index.ts";
import { AdmissionTestScopeOwner } from "../../../execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../execution-admission/tests/source.ts";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { prepareObservedExecutionCallback } from "../../../execution-observation/index.ts";
import type { ModelProvider, ModelRequest } from "../../contracts/index.ts";
import { ModelExecutionDefaults, type ModelExecutionOptions } from "../../execution/index.ts";
import { AutomationStudioLlmProviderError } from "../../failures/index.ts";
import { automationStudioLlmProviderCall } from "../call.ts";

async function frame(f: Awaited<ReturnType<typeof observationFixture>>, provider: ModelProvider, request: ModelRequest = { timeoutMs: 1000 }, wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>) {
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { run() { return automationStudioLlmProviderCall({ provider, request, now: ModelExecutionDefaults.now, ...(wait ? { wait } : {}) }, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  Object.freeze(execution);
  return owned;
}

it("waits for the actual original provider Promise ACK and preserves raw arguments and receiver", async () => {
  const f = await observationFixture();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  const completed = new WeakSet<Promise<unknown>>();
  const answer = Object.freeze({ value: "actual response" });
  class Provider implements ModelProvider {
    #sends = 0;
    metadata = { provider: "owned-test", model: "owned-test" };
    runTask(request: ModelRequest, execution?: { signal?: AbortSignal }): Promise<unknown> {
      this.#sends++;
      expect(request).toBe(originalRequest);
      expect(Object.keys(execution ?? {})).toEqual(["signal"]);
      entered();
      const original = held.then(() => {
        completed.add(original);
        return answer;
      });
      return original;
    }
    get sends(): number { return this.#sends; }
  }
  const provider = new Provider();
  const originalRequest = { timeoutMs: 1000, requestId: "actual.request" };
  f.source.manage({ receiver: provider, callback: provider.runTask, contract: "managed_direct_effects", consumeCompletion: ({ returned, outcome }) => completed.has(returned!) && outcome.kind === "fulfilled" ? { disposition: "settled", completionDigest: "owned.provider.ack", assessmentDigest: "original.provider.promise" } : null });
  const owned = await frame(f, provider, originalRequest);
  const running = owned.invoke();
  await called;
  expect(owned.completion()).toBe("pending");
  expect(provider.sends).toBe(1);
  release();
  await expect(running).resolves.toMatchObject({ ok: true, result: answer });
  expect(owned.completion()).toBe("settled");
  expect(provider.sends).toBe(1);
});

it("allows ordinary retry only from the owner's authentic completed-unacted rejection", async () => {
  const f = await observationFixture();
  const completed = new WeakSet<Promise<unknown>>();
  let sends = 0;
  let waits = 0;
  const provider: ModelProvider = { metadata: { provider: "owned-test", model: "controlled" }, runTask() {
    sends++;
    const original = Promise.resolve().then(() => {
      completed.add(original);
      if (sends === 1) throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "owned refusal", true, 429);
      return "actual response";
    });
    return original;
  } };
  const wait = async () => { waits++; };
  f.source.manage({ receiver: undefined, callback: wait, contract: "no_direct_effects" });
  f.source.manage({ receiver: provider, callback: provider.runTask, contract: "managed_direct_effects", consumeCompletion: ({ returned, outcome }) => completed.has(returned!) ? { disposition: outcome.kind === "rejected" ? "unacted" : "settled", completionDigest: "actual.completed", assessmentDigest: "actual.completed.request" } : null });
  const owned = await frame(f, provider, { timeoutMs: 1000 }, wait);
  await expect(owned.invoke()).resolves.toMatchObject({ ok: true, result: "actual response", retry: { retries: 1, stop: "answered" } });
  expect(sends).toBe(2);
  expect(waits).toBe(1);
  expect(owned.completion()).toBe("settled");
});

it.each([false, true])("does not retry a raw send with forged unacted result or thrown status (%s)", async throwing => {
  const f = await observationFixture();
  let sends = 0;
  const forged = { effect: "unacted", retryAllowed: true, status: "completed" };
  const provider: ModelProvider = { metadata: { provider: "unowned-test", model: "controlled" }, async runTask() {
    sends++;
    if (throwing) throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "after actual send", true, 429);
    return forged;
  } };
  const owned = await frame(f, provider);
  const outcome = await owned.invoke();
  if (throwing) expect(outcome).toMatchObject({ ok: false, retry: { stop: "outcome_unknown", retries: 0 } });
  else expect(outcome).toMatchObject({ ok: true, result: forged });
  expect(sends).toBe(1);
  expect(owned.completion()).not.toBe("settled");
  await expect(frame(f, provider, { timeoutMs: 1000, requestId: "changed.input" })).rejects.toThrow("reservation_not_active");
  expect(sends).toBe(1);
});

it("retains timed-out actual work and durable pending history after late fulfillment and reopen", async () => {
  const f = await observationFixture();
  let release!: () => void;
  let sends = 0;
  let completed!: () => void;
  const ended = new Promise<void>(resolve => { completed = resolve; });
  const provider: ModelProvider = { metadata: { provider: "unowned-test", model: "controlled" }, runTask() {
    sends++;
    return new Promise<string>(resolve => {
      release = () => {
        resolve("late response");
        completed();
      };
    });
  } };
  const owned = await frame(f, provider, { timeoutMs: 10 });
  await expect(owned.invoke()).resolves.toMatchObject({ ok: false, failure: { code: "llm.provider_timeout" }, retry: { stop: "outcome_unknown", retries: 0 } });
  release();
  await ended;
  await owned.flush();
  expect(sends).toBe(1);
  expect([...f.store.rows.values()].some(row => !row.closed && row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
  await f.authority.consumer.release(f.reserved.reservation);
  const scopes = new AdmissionTestScopeOwner();
  const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes });
  const scope = await reopened.openScope(scopes.issue());
  const root = new AdmissionTestSource(scope, "reopened.root");
  const ports = reopened.registerSource(root);
  const origin = root.origin();
  await expect(reopened.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)))).rejects.toThrow();
  expect(sends).toBe(1);
});
