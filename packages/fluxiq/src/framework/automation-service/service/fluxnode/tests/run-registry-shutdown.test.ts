import { fluxNodeSpecSchema } from "@fluxiq/contracts/fluxnode";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { FluxNodeRun } from "../fluxnode-run.ts";
import { FluxNodeRunRegistry } from "../run-registry.ts";

function deferred() {
  let settle = (): void => undefined;
  const promise = new Promise<void>((resolve) => { settle = resolve; });
  return { promise, resolve: () => settle() };
}

function entry(id: string) {
  const spec = fluxNodeSpecSchema.parse({ name: `unit.${id}`, runtime: "unit", start: "unit://fixture", goal: "Read the unit fixture.", scope: { acts: [] } });
  const target = { name: spec.name, specHash: "a".repeat(64), projectId: "project", flowId: id, flowPath: `nodes/unit/${id}` };
  const run = new FluxNodeRun(id, target, { inputs: {} }, "/unit/events", Date.now);
  return { run, registered: { ...target, spec, registeredAt: 0 } };
}

describe("FluxNode service shutdown", () => {
  it("stops held controllers and waits for their finalization without any resource lease", async () => {
    const registry = new FluxNodeRunRegistry();
    const parent = entry("parent");
    const gate = deferred();
    let finalized = false;
    registry.add(parent.run, parent.registered, async () => {
      await gate.promise;
      finalized = true;
    });
    const closing = registry.close();
    try {
      await setImmediate();
      expect(registry.accepting).toBe(false);
      expect(parent.run.stopRequested).toBe(true);
      expect(finalized).toBe(false);
      gate.resolve();
      await closing;
      expect(finalized).toBe(true);
      expect(registry.close()).toBe(closing);
    } finally {
      gate.resolve();
      await closing;
    }
  });

  it("awaits an in-flight admission before stopping and draining its late registration", async () => {
    const registry = new FluxNodeRunRegistry();
    const registration = deferred();
    const finalization = deferred();
    const late = entry("late");
    const admission = registry.track(async () => {
      await registration.promise;
      registry.add(late.run, late.registered, async () => await finalization.promise);
    });
    const closing = registry.close();
    let closed = false;
    void closing.then(() => { closed = true; });
    try {
      await expect(registry.track(async () => undefined)).rejects.toThrow("closing");
      registration.resolve();
      await admission;
      await setImmediate();
      expect(late.run.stopRequested).toBe(true);
      expect(closed).toBe(false);
      finalization.resolve();
      await closing;
    } finally {
      registration.resolve();
      finalization.resolve();
      await closing;
    }
  });

  it("preserves finalization failures rather than reporting a clean shutdown", async () => {
    const registry = new FluxNodeRunRegistry();
    const run = entry("broken");
    const gate = deferred();
    const original = new Error("owner finalization failed");
    registry.add(run.run, run.registered, async () => {
      await gate.promise;
      throw original;
    });
    const closing = registry.close();
    gate.resolve();
    await expect(closing).rejects.toMatchObject({ errors: [original] });
  });

  it("a late registration is stopped before its worker while another admission remains blocked", async () => {
    const registry = new FluxNodeRunRegistry();
    const slow = deferred();
    const ready = deferred();
    const late = entry("late-worker");
    let acted = false;
    const slowAdmission = registry.track(async () => await slow.promise);
    const fastAdmission = registry.track(async () => {
      await ready.promise;
      registry.add(late.run, late.registered, async () => { acted = !late.run.stopRequested; });
    });
    const closing = registry.close();
    try {
      ready.resolve();
      await fastAdmission;
      await setImmediate();
      expect(late.run.stopRequested).toBe(true);
      expect(acted).toBe(false);
    } finally {
      ready.resolve();
      slow.resolve();
      await Promise.all([slowAdmission, fastAdmission, closing]);
    }
  });
});
