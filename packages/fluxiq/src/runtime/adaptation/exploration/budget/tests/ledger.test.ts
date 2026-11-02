import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioVirtualClock } from "../../../../environment/index.ts";
import { startAutomationStudioRecoveryDeadline } from "../../../deadline/index.ts";
import { AutomationStudioExplorationBudgetLedger, resolveAutomationStudioExplorationBudget } from "../index.ts";

afterEach(() => vi.restoreAllMocks());

describe("exploration timer ownership", () => {
  it("uses virtual time and keeps the whole-recovery reason when deadlines tie", () => {
    const clock = new AutomationStudioVirtualClock(100);
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 25 }),
      startedAtMs: clock.now(),
      now: () => clock.now(),
      startTimer: clock.startTimer,
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 100, maxDurationMs: 25 })
    });
    clock.advance(24);
    expect(ledger.signal.aborted).toBe(false);
    clock.advance(1);
    expect(ledger.stopReason).toBe("recovery_deadline_expired");
    expect(ledger.signal.reason.name).toBe("TimeoutError");
    expect(ledger.admitProviderCall()).toEqual({ admitted: false, stopReason: "recovery_deadline_expired" });
    ledger.close();
  });

  it("cancels the original handle and detaches the original listener exactly once", () => {
    const external = new AbortController();
    const listen = vi.spyOn(external.signal, "addEventListener");
    const detach = vi.spyOn(external.signal, "removeEventListener");
    const handle = { cancel: vi.fn(function (this: unknown) { expect(this).toBe(handle); }) };
    const originalCancel = handle.cancel;
    const input = {
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      externalSignal: external.signal,
      startTimer(this: unknown, wait: { readonly kind: string }, delay: number, _fire: () => void) {
        expect(this).toBe(input);
        expect(wait).toEqual({ kind: "exploration_timeout" });
        expect(delay).toBe(600_000);
        return handle;
      }
    };
    const ledger = new AutomationStudioExplorationBudgetLedger(input);
    handle.cancel = vi.fn();
    ledger.close();
    ledger.close();
    external.abort();
    expect(originalCancel).toHaveBeenCalledTimes(1);
    expect(handle.cancel).not.toHaveBeenCalled();
    expect(detach).toHaveBeenCalledWith("abort", listen.mock.calls[0]?.[1]);
    expect(ledger.signal.aborted).toBe(false);
  });

  it("does not arm an already-aborted exploration and keeps external cancellation separate from expiry", () => {
    const external = new AbortController();
    external.abort(new Error("external detail"));
    const startTimer = vi.fn(() => ({ cancel() {} }));
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      startTimer, externalSignal: external.signal
    });
    expect(startTimer).not.toHaveBeenCalled();
    expect(ledger.signal.reason.name).toBe("AbortError");
    expect(ledger.stopReason).toBeUndefined();
    ledger.close();
  });

  it("cancels promptly on external abort and surfaces a cancellation failure from owner close", () => {
    const external = new AbortController();
    const failure = new Error("cancel failed");
    const cancel = vi.fn(() => { throw failure; });
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      startTimer: () => ({ cancel }), externalSignal: external.signal
    });
    external.abort();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(ledger.signal.reason.name).toBe("AbortError");
    expect(ledger.stopReason).toBeUndefined();
    expect(() => ledger.close()).toThrow(failure);
    expect(() => ledger.close()).not.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a synchronously fired timer after its original handle arrives", () => {
    const cancel = vi.fn();
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      startTimer: (_wait, _delay, fire) => {
        fire();
        return { cancel };
      }
    });
    expect(ledger.stopReason).toBe("wall_clock_expired");
    expect(ledger.signal.reason.name).toBe("TimeoutError");
    ledger.close();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("propagates synchronous cancellation failure without cancelling the returned handle twice", () => {
    const failure = new Error("sync cancel failed");
    const cancel = vi.fn(() => { throw failure; });
    expect(() => new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      startTimer: (_wait, _delay, fire) => {
        fire();
        return { cancel };
      }
    })).toThrow(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("retains an asynchronous expiry cleanup failure while still aborting with TimeoutError", () => {
    let expire: (() => void) | undefined;
    const failure = new Error("expiry cancel failed");
    const cancel = vi.fn(() => { throw failure; });
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      startTimer: (_wait, _delay, fire) => {
        expire = fire;
        return { cancel };
      }
    });
    expire?.();
    expect(ledger.signal.reason.name).toBe("TimeoutError");
    expect(ledger.stopReason).toBe("wall_clock_expired");
    expect(() => ledger.close()).toThrow(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("detaches after a scheduling failure without replacing the original failure", () => {
    const external = new AbortController();
    const detach = vi.spyOn(external.signal, "removeEventListener");
    const failure = new Error("schedule failed");
    expect(() => new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
      externalSignal: external.signal, startTimer: () => { throw failure; }
    })).toThrow(failure);
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("keeps a native timer unrefed and cancels it when constructor setup fails", () => {
    const handle = setTimeout(() => undefined, 60_000);
    const failure = new Error("unref failed");
    const unref = vi.spyOn(handle, "unref").mockImplementation(() => { throw failure; });
    vi.spyOn(globalThis, "setTimeout").mockReturnValue(handle);
    const clear = vi.spyOn(globalThis, "clearTimeout");
    expect(() => new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0
    })).toThrow(failure);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(handle);
  });

  it("aggregates constructor failure with cleanup failure and preserves both original errors", () => {
    const external = new AbortController();
    const primary = new Error("schedule failed");
    const cleanup = new Error("detach failed");
    vi.spyOn(external.signal, "removeEventListener").mockImplementation(() => { throw cleanup; });
    let thrown: unknown;
    try {
      new AutomationStudioExplorationBudgetLedger({
        budget: resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0,
        externalSignal: external.signal, startTimer: () => { throw primary; }
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown).toHaveProperty("errors", [primary, cleanup]);
  });
});
