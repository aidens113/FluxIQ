import { expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import { enteredObservationFixture } from "../../../../runtime/execution-observation/tests/frame.ts";
import { observeAutomationStudioFacts } from "../index.ts";

const groups = [{ key: "facts", conditions: [{ fact: "available", op: "exists" as const }] }];

it.each(["own", "inherited"] as const)("fences the actual fact adapter's %s evaluator getter", async placement => {
  const f = await enteredObservationFixture();
  let reads = 0;
  await f.run(async observation => {
    const owner = { capabilities: [] };
    Object.defineProperty(owner, "factEvaluator", { get() {
      reads++;
      return () => [{ result: "true", capturedAt: 1 }];
    } });
    const host: AutomationStudioHostRuntimeBoundary = placement === "own" ? owner : Object.create(owner);
    await expect(observeAutomationStudioFacts({ hostRuntime: host, groups, context: {} }, observation)).rejects.toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  await f.pending();
});

it("rechecks the original live clock after the actual fact callback awaited", async () => {
  const f = await enteredObservationFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now");
  if (!descriptor) throw new Error("test.native_clock_missing");
  let reads = 0;
  let caught: unknown;
  const host: AutomationStudioHostRuntimeBoundary = { capabilities: [], factEvaluator: async () => {
    await Promise.resolve();
    Object.defineProperty(Date, "now", { configurable: true, get() {
      reads++;
      return () => 7;
    } });
    return [{ result: "true", capturedAt: 1 }];
  } };
  f.source.manage({ receiver: host, callback: host.factEvaluator!, contract: "no_direct_effects" });
  await f.run(async observation => {
    try {
      await observeAutomationStudioFacts({ hostRuntime: host, groups, context: {}, now: automationStudioLiveRunEnvironment.now }, observation);
    } catch (error) {
      caught = error;
    } finally {
      Object.defineProperty(Date, "now", descriptor);
    }
  });
  expect(caught).toEqual(new Error("native_clock.identity_unavailable"));
  expect(reads).toBe(0);
  await f.pending();
});
