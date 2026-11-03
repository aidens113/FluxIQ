import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { invokeOwnedExecutionCallbackSync, prepareObservedExecutionCallback } from "../../../execution-observation/owned/index.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";
import { ModelRunBudgetLedger, type ModelRunLedgerPolicy } from "../index.ts";

const limits = { maxTotalTokensPerRun: 1000, maxOutputTokensPerRun: 200 };
const request = {
  runId: "observed.run", requestId: "observed.request", estimatedInputTokens: 100, maxOutputTokens: 20, maxEstimatedCostUsd: 0.01,
  call: { taskKind: "review", stage: "evaluation", promptVersion: "v1", provider: "owned", model: "owned" }
};

async function ledgerFrame(f: Awaited<ReturnType<typeof observationFixture>>, action: (execution: ModelExecutionOptions) => void) {
  const execution: ModelExecutionOptions = {};
  const core = { run() { action(execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  if (owned.observation) Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(execution);
  return owned;
}

it("declares only its inspected original reserve and fresh observed lease closures", async () => {
  const f = await observationFixture();
  const policy: ModelRunLedgerPolicy = {
    defaultCostCeilingUsd: 0.1, maxCallsPerRun: 10, recordLimit: 10,
    isTaskKind: (value): value is string => value === "review",
    isStage: (value): value is string => value === "evaluation"
  };
  ExecutionCallbackPolicies.remember(policy, policy.isTaskKind, "pure");
  ExecutionCallbackPolicies.remember(policy, policy.isStage, "pure");
  const ledger = new ModelRunBudgetLedger(limits, policy);
  const owned = await ledgerFrame(f, execution => {
    const reserved = invokeOwnedExecutionCallbackSync(execution.observation, { receiver: ledger, callback: ledger.reserve, args: [request, execution] });
    if (!reserved.ok) throw new Error("The actual call should fit.");
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: reserved.lease, callback: reserved.lease.complete, args: [{ estimatedCostUsd: 0.003 }] });
    reserved.lease.complete({ estimatedCostUsd: 0.02 });
  });
  await owned.invoke();
  await f.source.flush();
  expect(ledger.snapshot(request.runId)).toMatchObject({ calls: 1, estimatedCostUsd: 0.003, pendingCalls: 0 });
  expect(ledger.callRecords(request.runId).calls[0]).toMatchObject({ taskKind: "review", stage: "evaluation" });
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(false);
});

it("keeps arbitrary supplied receipt policies unsupported despite their truthy vocabulary result", async () => {
  const f = await observationFixture();
  let calls = 0;
  const policy: ModelRunLedgerPolicy = {
    defaultCostCeilingUsd: 0.1, maxCallsPerRun: 10, recordLimit: 10,
    isTaskKind(value): value is string {
      calls++;
      return value === "review";
    },
    isStage: (value): value is string => value === "evaluation"
  };
  // Only the original data-only stage check is trusted; the task-kind callback is deliberately unsupported.
  ExecutionCallbackPolicies.remember(policy, policy.isStage, "pure");
  const ledger = new ModelRunBudgetLedger(limits, policy);
  const owned = await ledgerFrame(f, execution => {
    const reserved = ledger.reserve(request, execution);
    if (!reserved.ok) throw new Error("The actual call should fit.");
    invokeOwnedExecutionCallbackSync(execution.observation, { receiver: reserved.lease, callback: reserved.lease.complete, args: [{ estimatedCostUsd: 0.003 }] });
  });
  // The first unsupported callback runs once; its terminal fence stops the next policy callback.
  await expect(owned.invoke()).rejects.toThrow("frame_outcome_unknown");
  await f.source.flush();
  expect(calls).toBe(1);
  expect(ledger.snapshot(request.runId).calls).toBe(1);
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
});

it("does not grant a subclass override or an unobserved completion the native method's contract", () => {
  const policy: ModelRunLedgerPolicy = {
    defaultCostCeilingUsd: 0.1, maxCallsPerRun: 10, recordLimit: 10,
    isTaskKind: (value): value is string => typeof value === "string",
    isStage: (value): value is string => typeof value === "string"
  };
  class SuppliedLedger extends ModelRunBudgetLedger {
    override reserve(input: Parameters<ModelRunBudgetLedger["reserve"]>[0]) { return super.reserve(input); }
  }
  const ledger = new SuppliedLedger(limits, policy);
  expect(ExecutionCallbackPolicies.isPure(ledger, ledger.reserve)).toBe(false);
  const reserved = ledger.reserve(request);
  if (!reserved.ok) throw new Error("The actual call should fit.");
  expect(ExecutionCallbackPolicies.isPure(reserved.lease, reserved.lease.complete)).toBe(false);
  expect(ExecutionCallbackPolicies.isPure(reserved.lease, reserved.lease.release)).toBe(true);
});
