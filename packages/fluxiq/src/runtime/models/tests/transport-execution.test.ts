import { createServer, type ServerResponse } from "node:http";
import { expect, it } from "vitest";
import { observationFixture } from "../../execution-observation/tests/fixture.ts";
import { prepareObservedExecutionCallback } from "../../execution-observation/index.ts";
import { ModelExecutionDefaults, ModelExecutionReceiptOwner, modelExecutionFromCarrier, type ModelExecutionOptions } from "../execution/index.ts";
import type { ModelProvider, ModelRequest } from "../contracts/index.ts";
import { AutomationStudioLlmProviderError } from "../failures/index.ts";
import { automationStudioLlmProviderCall } from "../retry/index.ts";
import { ModelTransportExecution } from "../transport/index.ts";
import { automationStudioAnthropicMessage, type AutomationStudioAnthropicMessageInput } from "../providers/anthropic/index.ts";
import type { ModelTransportObservation } from "../transport/index.ts";

async function server(reply: (response: ServerResponse) => void) {
  const native = createServer((_request, response) => reply(response));
  await new Promise<void>((resolve, reject) => {
    native.once("error", reject);
    native.listen(0, "127.0.0.1", resolve);
  });
  const address = native.address();
  if (!address || typeof address === "string") throw new Error("isolated test server missing address");
  return { url: `http://127.0.0.1:${address.port}/controlled-model`, async close() {
    native.closeAllConnections();
    await new Promise<void>((resolve, reject) => native.close(error => error ? reject(error) : resolve()));
  } };
}

it("keeps native fetch incomplete until the actual held response body and durable ACK finish", async () => {
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let physicalSends = 0;
  const local = await server(response => {
    physicalSends++;
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("first ");
    entered();
    void held.then(() => response.end("last"));
  });
  try {
    const f = await observationFixture();
    const execution: { observation?: ModelExecutionOptions["observation"] } = {};
    const core = { async run() {
      const transport = new ModelTransportExecution(execution);
      try {
        const response = await transport.fetch(undefined, fetch, [local.url], new AbortController().signal);
        const admissions = f.store.events.filter(event => event === "enter").length;
        await expect(transport.fetch(undefined, fetch, [local.url], new AbortController().signal)).rejects.toThrow("fetch_already_invoked");
        expect(f.store.events.filter(event => event === "enter")).toHaveLength(admissions);
        const text = await response.text();
        await transport.drained();
        return text;
      } finally { transport.dispose(); }
    } };
    f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
    const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
    execution.observation = owned.observation;
    const running = owned.invoke();
    await called;
    expect(owned.completion()).toBe("pending");
    release();
    await expect(running).resolves.toBe("first last");
    expect(owned.completion()).toBe("settled");
    expect(physicalSends).toBe(1);
  } finally {
    release();
    await local.close();
  }
});

it("retries a real drained native HTTP 429 using the original rejection receipt", async () => {
  let sends = 0;
  const local = await server(response => {
    sends++;
    response.writeHead(sends === 1 ? 429 : 200, { "content-type": "text/plain" });
    response.end(sends === 1 ? "completed refusal" : "actual answer");
  });
  try {
    const f = await observationFixture();
    const owner = new ModelExecutionReceiptOwner();
    const provider: ModelProvider = { metadata: { provider: "controlled-local-http", model: "controlled" }, runTask(request, raw) {
      const execution = modelExecutionFromCarrier(raw, provider, provider.runTask);
      const actual = (async () => {
        const transport = new ModelTransportExecution(execution);
        try {
          const signal = raw?.signal ?? new AbortController().signal;
          const response = await transport.fetch(undefined, fetch, [local.url, { signal }], signal);
          const body = await response.text();
          await transport.drained();
          if (!response.ok) throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "owned completed refusal", true, response.status);
          return { body, request };
        } finally { transport.dispose(); }
      })();
      return owner.returning(actual, execution);
    } };
    owner.register({ receiver: provider, callback: provider.runTask });
    const wait = async () => undefined;
    f.source.manage({ receiver: undefined, callback: wait, contract: "no_direct_effects" });
    const execution: { observation?: ModelExecutionOptions["observation"] } = {};
    const request: ModelRequest = { timeoutMs: 1000 };
    const core = { run() { return automationStudioLlmProviderCall({ provider, request, now: ModelExecutionDefaults.now, wait }, execution); } };
    f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
    const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
    execution.observation = owned.observation;
    await expect(owned.invoke()).resolves.toMatchObject({ ok: true, result: { body: "actual answer", request }, retry: { retries: 1 } });
    expect(owned.completion()).toBe("settled");
    expect(sends).toBe(2);
  } finally { await local.close(); }
});

it("does not certify an arbitrary injected fetch from its returned Response or a claimed drain", async () => {
  const f = await observationFixture();
  let sends = 0;
  const injected: typeof fetch = async () => {
    sends++;
    return new Response("forged complete");
  };
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { async run() {
    const transport = new ModelTransportExecution(execution);
    try {
      const response = await transport.fetch(undefined, injected, ["https://unit.invalid"], new AbortController().signal);
      const text = await response.text();
      await transport.drained();
      return text;
    } finally { transport.dispose(); }
  } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).rejects.toThrow("fetch_outcome_unknown");
  expect(owned.completion()).not.toBe("settled");
  expect(sends).toBe(1);
});

it("records an unsupported fulfilled secret callback before any later fetch invocation", async () => {
  const f = await observationFixture();
  let secrets = 0;
  let sends = 0;
  const input: AutomationStudioAnthropicMessageInput<string> = {
    body: "{}", model: "claude-sonnet-5-5", timeoutMs: 1000, maxResponseBytes: 10000, taskKind: "controlled",
    async resolveKey() {
      secrets++;
      return "unit-secret";
    },
    async fetchImpl() {
      sends++;
      return new Response("must not fetch");
    },
    screenMessage: value => value,
    readAnswer: text => text
  };
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { run() { return automationStudioAnthropicMessage(input, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).rejects.toMatchObject({ code: "llm.provider_network_error" });
  expect(secrets).toBe(1);
  expect(sends).toBe(0);
  expect(owned.completion()).not.toBe("settled");
});

it("awaits genuine secret completion and preserves two calls sharing the original caller signal", async () => {
  const f = await observationFixture();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const bothEntered = new Promise<void>(resolve => { entered = resolve; });
  const originalSignal = new AbortController().signal;
  const signals: AbortSignal[] = [];
  let sends = 0;
  const input: AutomationStudioAnthropicMessageInput<string> = {
    body: "{}", model: "claude-sonnet-5-5", timeoutMs: 1000, maxResponseBytes: 10000, taskKind: "controlled", signal: originalSignal,
    async resolveKey(signal) {
      signals.push(signal);
      if (signals.length === 2) entered();
      await held;
      return "unit-secret";
    },
    async fetchImpl() {
      sends++;
      return new Response(JSON.stringify({ type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "actual answer" }], usage: { input_tokens: 10, output_tokens: 5 } }), { headers: { "content-type": "application/json" } });
    },
    screenMessage: value => value,
    readAnswer: text => text
  };
  f.source.manage({ receiver: input, callback: input.resolveKey, contract: "no_direct_effects" });
  f.source.manage({ receiver: input, callback: input.fetchImpl, contract: "no_direct_effects" });
  f.source.manage({ receiver: input, callback: input.readAnswer, contract: "no_direct_effects" });
  const call = async () => {
    const execution: { observation?: ModelExecutionOptions["observation"] } = {};
    const core = { run() { return automationStudioAnthropicMessage(input, execution); } };
    f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
    const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
    execution.observation = owned.observation;
    return owned;
  };
  const first = await call();
  const second = await call();
  const running = Promise.all([first.invoke(), second.invoke()]);
  await bothEntered;
  expect(sends).toBe(0);
  expect(new Set(signals).size).toBe(2);
  expect(signals.every(signal => signal !== originalSignal)).toBe(true);
  release();
  await expect(running).resolves.toMatchObject([{ response: "actual answer" }, { response: "actual answer" }]);
  expect(sends).toBe(2);
  expect(first.completion()).toBe("settled");
  expect(second.completion()).toBe("settled");
  expect(input.signal).toBe(originalSignal);
});

it("pins the original observer methods and answer reader before waiting for the response", async () => {
  const f = await observationFixture();
  const calls: string[] = [];
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fetching = new Promise<void>(resolve => { entered = resolve; });
  const step: ModelTransportObservation = {
    reply() { calls.push("original.reply"); },
    succeeded() { calls.push("original.succeeded"); },
    failed() { calls.push("original.failed"); }
  };
  const input: AutomationStudioAnthropicMessageInput<string> = {
    body: "{}", model: "claude-sonnet-5-5", timeoutMs: 1000, maxResponseBytes: 10000, taskKind: "controlled",
    async resolveKey() { return "unit-secret"; },
    observe() { return step; },
    async fetchImpl() {
      entered();
      await held;
      return new Response(JSON.stringify({ type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "actual answer" }], usage: { input_tokens: 10, output_tokens: 5 } }), { headers: { "content-type": "application/json" } });
    },
    readAnswer() { return "original.answer"; },
    screenMessage: value => value
  };
  f.source.manage({ receiver: input, callback: input.resolveKey, contract: "no_direct_effects" });
  f.source.manage({ receiver: input, callback: input.observe!, contract: "no_direct_effects" });
  f.source.manage({ receiver: input, callback: input.fetchImpl, contract: "no_direct_effects" });
  f.source.manage({ receiver: input, callback: input.readAnswer, contract: "no_direct_effects" });
  f.source.manage({ receiver: step, callback: step.reply, contract: "no_direct_effects" });
  f.source.manage({ receiver: step, callback: step.succeeded, contract: "no_direct_effects" });
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { run() { return automationStudioAnthropicMessage(input, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  const running = owned.invoke();
  await fetching;
  step.reply = () => { calls.push("replacement.reply"); };
  step.succeeded = () => { calls.push("replacement.succeeded"); };
  input.readAnswer = () => "replacement.answer";
  release();
  await expect(running).resolves.toMatchObject({ response: "original.answer" });
  expect(calls).toEqual(["original.reply", "original.succeeded"]);
  expect(owned.completion()).toBe("settled");
});
