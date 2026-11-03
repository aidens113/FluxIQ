import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { OriginalExecutionPromiseReceipts } from "../../../execution-observation/queue-completion/index.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { AutomationStudioLlmBuildPurseLedger } from "../settlement-ledger.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";

it("books once synchronously and awaits the original onSettled receiver, child and commit", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const events = { onSettled(this: unknown, usd: number, call: { judge: boolean; inputTokens: number | null }, execution?: ModelExecutionOptions) {
    expect(this).toBe(events);
    expect(usd).toBe(0.007);
    expect(call).toEqual({ judge: true, inputTokens: 17 });
    const observation = execution?.observation;
    if (!observation) throw new Error("Missing actual settlement observation.");
    expect(observation).not.toBe(f.observation);
    calls++;
    entered();
    const original: Promise<void> = held.then((): void => receipts.issueObserved(original, observation, { disposition: "settled", completionDigest: "fixture.original-write", assessmentDigest: "fixture.acknowledged-prefix" }));
    return original;
  } };
  ExecutionCallbackPolicies.rememberManaged({ receiver: events, callback: events.onSettled, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, events);
  const hold = ledger.hold(0.01, 0.01, true, { observation: f.observation });
  const original = hold.settleObserved!({ estimatedCostUsd: 0.007, inputTokens: 17 });
  expect(ledger.calls.spentCalls()).toBe(1);
  expect(ledger.pendingUsd()).toBe(0);
  expect(ledger.settledUsd()).toBe(0.007);
  expect(hold.settleObserved!()).toBe(original);
  hold.settle({ estimatedCostUsd: 0.02 });
  await called;
  expect(calls).toBe(1);
  release();
  await original;
  expect(ledger.settledUsd()).toBe(0.007);
});

it("does not charge an unsent hold or retroactively certify a legacy settlement", async () => {
  const f = await observationFixture();
  let calls = 0;
  const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, { onSettled() { calls++; } });
  const unsent = ledger.hold(0.01, 0.01, false, { observation: f.observation });
  unsent.release();
  await unsent.settleObserved!();
  expect(ledger.calls.spentCalls()).toBe(0);
  expect(calls).toBe(0);
  const legacy = ledger.hold(0.01, 0.01, false, { observation: f.observation });
  legacy.settle({ estimatedCostUsd: 0.004 });
  await expect(legacy.settleObserved!()).rejects.toThrow("settlement_already_unobserved");
  expect(calls).toBe(1);
  expect(ledger.calls.spentCalls()).toBe(1);
});

it("rejects a foreign original observation before charging or calling settlement", async () => {
  const [one, two] = await Promise.all([observationFixture(), observationFixture()]);
  let calls = 0;
  const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, { onSettled() { calls++; } });
  const hold = ledger.hold(0.01, 0.01, false, { observation: one.observation });
  await expect(hold.settleObserved!(undefined, { observation: two.observation })).rejects.toThrow("foreign_settlement_observation");
  expect(calls).toBe(0);
  expect(ledger.calls.spentCalls()).toBe(0);
  expect(ledger.pendingUsd()).toBe(0.01);
});

it("keeps an unacknowledged fulfilled onSettled callback durably unknown", async () => {
  const f = await observationFixture();
  let writes = 0;
  const events = { async onSettled() { writes++; } };
  const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, events);
  const hold = ledger.hold(0.01, 0.01, false, { observation: f.observation });
  await expect(hold.settleObserved!({ estimatedCostUsd: 0.002 })).rejects.toThrow("settlement_callback_unverified");
  expect(writes).toBe(1);
  expect(ledger.settledUsd()).toBe(0.002);
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
});
