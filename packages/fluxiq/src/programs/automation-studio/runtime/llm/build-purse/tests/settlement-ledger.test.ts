import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurseLedger } from "../settlement-ledger.ts";

describe("a build's canonical settlement provenance", () => {
  it("distinguishes a reported free call from an unpriced, unreported zero charge", () => {
    const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, {});
    ledger.hold(0, undefined).settle({ estimatedCostUsd: 0 });
    expect(ledger.unreportedZeroChargeCalls).toBe(0);
    const unknown = ledger.hold(0, undefined);
    unknown.settle();
    unknown.settle();
    expect(ledger.unreportedZeroChargeCalls).toBe(1);
    expect(ledger.calls.spentCalls()).toBe(2);
    expect(ledger.settledUsd()).toBe(0);
  });

  it("retains a positive conservative charge and releases a proven unsent hold without a call", () => {
    const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, {});
    ledger.hold(0.02, 0.02).settle();
    const unsent = ledger.hold(0, undefined);
    unsent.release();
    unsent.settle();
    expect(ledger.unreportedZeroChargeCalls).toBe(0);
    expect(ledger.calls.spentCalls()).toBe(1);
    expect(ledger.calls.pendingCalls()).toBe(0);
    expect(ledger.settledUsd()).toBe(0.02);
  });

  it("tells onSettled each call's reported input tokens, or null when it reported no whole count", () => {
    const settled: Array<{ usd: number; judge: boolean; inputTokens: number | null }> = [];
    const ledger = new AutomationStudioLlmBuildPurseLedger(undefined, { onSettled: (usd, call) => settled.push({ usd, ...call }) });
    ledger.hold(0.01, 0.01, true).settle({ estimatedCostUsd: 0.004, inputTokens: 12_000 });
    ledger.hold(0.01, 0.01).settle();
    ledger.hold(0.01, 0.01).settle({ estimatedCostUsd: 0.002, inputTokens: 1.5 });
    expect(settled).toEqual([
      { usd: 0.004, judge: true, inputTokens: 12_000 },
      { usd: 0.01, judge: false, inputTokens: null },
      { usd: 0.002, judge: false, inputTokens: null }
    ]);
  });
});
