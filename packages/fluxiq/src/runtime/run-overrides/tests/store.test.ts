// A run's overrides frame (W3, t899) is per run: many runs share one process in
// the hosted service, so a frame lives in its own run's async context and the
// process-wide registry holds only the AsyncLocalStorage instance, which two
// copies of Core (the web panel's bundle and the domain's `dist`) must share.

import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, vi } from "vitest";
import { automationStudioRunOverrides, runWithAutomationStudioRunOverrides } from "../index.ts";

const REGISTERED = Symbol.for("fluxiq.automation-studio.run-overrides");

/** Lets other queued work run, so two runs' steps interleave. */
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("a run's overrides frame", () => {
  it("is nothing outside every run", () => {
    expect(automationStudioRunOverrides()).toBeUndefined();
  });

  it("is read anywhere in the run's async chain, and gone once it ends", async () => {
    const seen = await runWithAutomationStudioRunOverrides({ nodeAttempts: 6 }, async () => {
      await yieldTurn();
      return automationStudioRunOverrides()?.nodeAttempts;
    });
    expect(seen).toBe(6);
    expect(automationStudioRunOverrides()).toBeUndefined();
  });

  it("keeps two concurrent runs apart, however their steps interleave", async () => {
    const readings: Record<string, (number | undefined)[]> = { first: [], second: [] };
    const run = (label: string, nodeAttempts: number) => runWithAutomationStudioRunOverrides({ nodeAttempts }, async () => {
      for (let step = 0; step < 5; step += 1) {
        readings[label]!.push(automationStudioRunOverrides()?.nodeAttempts);
        await yieldTurn();
      }
    });
    await Promise.all([run("first", 7), run("second", 5)]);
    expect(readings.first).toEqual([7, 7, 7, 7, 7]);
    expect(readings.second).toEqual([5, 5, 5, 5, 5]);
  });

  it("is replaced whole by a frame set inside it, never merged with it", async () => {
    await runWithAutomationStudioRunOverrides({ nodeAttempts: 9, digest: "outer" }, async () => {
      const inner = await runWithAutomationStudioRunOverrides({}, async () => {
        await yieldTurn();
        return automationStudioRunOverrides();
      });
      expect(inner).toEqual({});
      expect(automationStudioRunOverrides()).toEqual({ nodeAttempts: 9, digest: "outer" });
    });
  });

  it("is the caller's frame as it stood when the run began, and cannot be changed in the run", async () => {
    const frame: { nodeAttempts: number } = { nodeAttempts: 6 };
    await runWithAutomationStudioRunOverrides(frame, async () => {
      frame.nodeAttempts = 50;
      await yieldTurn();
      const read = automationStudioRunOverrides()!;
      expect(read.nodeAttempts).toBe(6);
      expect(Object.isFrozen(read)).toBe(true);
    });
  });

  it("is registered process-wide as the store only, never as a frame", async () => {
    await runWithAutomationStudioRunOverrides({ nodeAttempts: 6 }, async () => {
      const registered = (globalThis as Record<symbol, unknown>)[REGISTERED];
      expect(registered).toBeInstanceOf(AsyncLocalStorage);
    });
  });

  it("is one store for two copies of the module, so a frame set through one is read through the other", async () => {
    vi.resetModules();
    const copy = await import("../index.ts");
    // A fresh evaluation, not the same module instance.
    expect(copy.automationStudioRunOverrides).not.toBe(automationStudioRunOverrides);
    const readByCopy = await runWithAutomationStudioRunOverrides({ nodeAttempts: 8 }, async () => {
      await yieldTurn();
      return copy.automationStudioRunOverrides()?.nodeAttempts;
    });
    const readByOriginal = await copy.runWithAutomationStudioRunOverrides({ nodeAttempts: 3 }, async () => automationStudioRunOverrides()?.nodeAttempts);
    expect(readByCopy).toBe(8);
    expect(readByOriginal).toBe(3);
  });
});
