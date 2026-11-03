import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { prepareObservedExecutionCallback } from "../../../execution-observation/owned/index.ts";
import { automationStudioLlmProjectedCallCostUsd } from "../projected-cost.ts";

async function priceFrame(f: Awaited<ReturnType<typeof observationFixture>>, provider: Parameters<typeof automationStudioLlmProjectedCallCostUsd>[0], inputTokens: number, outputTokens: number) {
  const execution: { observation?: typeof f.observation } = {};
  const core = { run() { return automationStudioLlmProjectedCallCostUsd(provider, inputTokens, outputTokens, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (owned.observation) execution.observation = owned.observation;
  Object.freeze(execution);
  return owned;
}

it("preserves the original estimator receiver, token tuple and projected arithmetic", async () => {
  const f = await observationFixture();
  const provider = { estimateCostUsd(tokens: { inputTokens: number; outputTokens: number }) {
    expect(this).toBe(provider);
    expect(tokens).toEqual({ inputTokens: 17, outputTokens: 9 });
    return 0.003;
  } };
  ExecutionCallbackPolicies.remember(provider, provider.estimateCostUsd, "pure");
  const owned = await priceFrame(f, provider, 17, 9);
  await expect(owned.invoke()).resolves.toBe(0.003);
  await f.source.flush();
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(false);
});

it("records an unsupported original estimator as unknown despite its returned price", async () => {
  const f = await observationFixture();
  let calls = 0;
  const provider = { estimateCostUsd() {
    calls++;
    return 0.001;
  } };
  const owned = await priceFrame(f, provider, 1, 1);
  await expect(owned.invoke()).resolves.toBe(0.001);
  await f.source.flush();
  expect(calls).toBe(1);
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
});

it("retains unobserved price fallback and the observed original estimator error", async () => {
  const f = await observationFixture();
  const error = new Error("actual estimator failed");
  const provider = { estimateCostUsd() { throw error; } };
  expect(automationStudioLlmProjectedCallCostUsd(provider, 1, 1)).toBeUndefined();
  const owned = await priceFrame(f, provider, 1, 1);
  await expect(owned.invoke()).rejects.toBe(error);
  await f.source.flush();
});
