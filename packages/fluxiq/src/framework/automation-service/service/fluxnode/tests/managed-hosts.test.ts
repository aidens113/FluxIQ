// @fluxiq-test-group real-sql
import { fluxNodeSpecSchema, parseDataPipeline } from "@fluxiq/contracts/fluxnode";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayService } from "../../../../../client-gateway/index.ts";
import { AutomationStudioHostLeaseScope } from "../../../../../runtime/project-agents/host-resources/index.ts";
import { complete } from "../../answer-first/tests/fake-library.ts";
import { createFluxNodeService } from "../create-fluxnode-service.ts";
import * as acts from "../act-scope/index.ts";
import { FluxNodeHostPool } from "../hosts/index.ts";
import { FluxNodeRunRegistry } from "../run-registry.ts";
import { findLoans, findLoansSpec, fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function fixture() {
  const bound = new Map<string, { isCurrent(): boolean }>();
  const leaves: string[] = [];
  let releases = 0;
  const gateway = { snapshot: () => ({ sessions: [{ sessionId: "isolated-one", managedHostId: "host-one", status: "ready", metadata: { domainId: "library" } }] }),
    onEvent: () => () => undefined,
    managedHosts: { bindRun: (input: { runId: string; isCurrent(): boolean }) => {
      expect(bound.size).toBe(0);
      bound.set(input.runId, input);
      leaves.push(input.runId);
      return () => {
        expect(bound.delete(input.runId)).toBe(true);
        releases++;
      };
    } }
  } as unknown as ClientGatewayService;
  const pool = new FluxNodeHostPool({ gateway, domainId: "library", capacity: 1 });
  cleanups.push(() => pool.close());
  return { pool, bound, leaves, releases: () => releases };
}

function deferred() {
  let settle = (): void => undefined;
  const promise = new Promise<void>((resolve) => { settle = resolve; });
  return { promise, resolve: () => settle() };
}

function owners(onRelease: (ordinal: number) => Promise<void> = async () => undefined) {
  const original = acts.fluxNodeExecutionOwner;
  let released = 0;
  let taken = 0;
  vi.spyOn(acts, "fluxNodeExecutionOwner").mockImplementation(async (file) => {
    const held = await original(file);
    const ordinal = taken++;
    return held ? { ...held, release: async () => {
      released++;
      await onRelease(ordinal);
      await held.release();
    } } : undefined;
  });
  return () => released;
}

describe("leased FluxNode leaf execution", () => {
  it("a one-host pipeline owns only its child leaves and completes nested map calls", async () => {
    const f = fixture();
    const released = owners();
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec({ hasCheck: false, options: { judge: "off" } })) });
    const pipeline = parseDataPipeline({ name: "library.leased-report", source: { kind: "input", field: "titles" },
      steps: [{ id: "find", kind: "map", target: { fluxNode: "library.find-loans" }, inputs: { title: { field: "title" } }, concurrency: 2, as: "found" }] });
    if (!pipeline.ok) throw new Error("The fixture pipeline is invalid.");
    const result = await lane.run({ pipeline: pipeline.value, inputs: { titles: [{ title: "Atlas" }, { title: "Clock" }] } }, { script: [() => {
      expect(AutomationStudioHostLeaseScope.current()?.sessionId).toBe("isolated-one");
      return findLoans("Atlas");
    }, complete("Found the loans.")] });
    expect(result.result.status).toBe("achieved");
    expect(result.result.outputs).toEqual([
      { title: "Atlas", found: { loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] } },
      { title: "Clock", found: { loans: [{ title: "Clockmaking", due: "2030-01-03" }] } }
    ]);
    expect(f.leaves).toHaveLength(2);
    expect(f.leaves).not.toContain(result.result.runId);
    expect(f.releases()).toBe(2);
    expect(released()).toBe(3);
    expect(f.bound.size).toBe(0);
  });

  it("a queued user Stop never claims a host and releases execution ownership once", async () => {
    const f = fixture();
    const released = owners();
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    const gate = deferred();
    const occupying = f.pool.run("occupied", "other-project", new AbortController().signal, async () => await gate.promise);
    try {
      const result = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { onStarted: async (state) => {
        expect(await lane.fluxNodes.stop(OWNER, state.runId, { reason: "The person pressed Stop." })).toMatchObject({ ok: true, value: { state: "stopped" } });
      } });
      expect(result.result.status).toBe("stopped");
      expect(result.asked).toHaveLength(0);
      expect(f.leaves).toEqual(["occupied"]);
      expect(released()).toBe(1);
    } finally {
      gate.resolve();
      await occupying;
    }
    expect(f.releases()).toBe(1);
  });

  it("pool close revokes active authority, stops the leaf and drains its owner release", async () => {
    const f = fixture();
    const ownerEntered = deferred();
    const finishOwner = deferred();
    const released = owners(async () => {
      ownerEntered.resolve();
      await finishOwner.promise;
    });
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    const entered = deferred();
    const answer = deferred();
    const running = lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { script: [async () => {
      entered.resolve();
      await answer.promise;
      return findLoans("Atlas");
    }, complete("Found.")] });
    try {
      await Promise.race([entered.promise, running.then(() => { throw new Error("The leaf ended before the model fixture was entered."); })]);
      expect([...f.bound.values()][0]?.isCurrent()).toBe(true);
      const closing = f.pool.close();
      let closed = false;
      void closing.then(() => { closed = true; });
      await setImmediate();
      expect(closed).toBe(false);
      expect([...f.bound.values()][0]?.isCurrent()).toBe(false);
      answer.resolve();
      await ownerEntered.promise;
      await setImmediate();
      expect(closed).toBe(false);
      expect(f.bound.size).toBe(1);
      finishOwner.resolve();
      expect((await running).result.status).toBe("stopped");
      await closing;
      expect(released()).toBe(1);
      expect(f.releases()).toBe(1);
      expect(f.bound.size).toBe(0);
    } finally {
      answer.resolve();
      finishOwner.resolve();
      await running;
    }
  });

  it.each([false, true])("a failed run registration releases ownership once without taking a host, release fails: %s", async (releaseFails) => {
    const f = fixture();
    const registrationError = new Error("registration refused");
    const releaseError = new RangeError("owner release failed");
    const released = owners(async () => { if (releaseFails) throw releaseError; });
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    vi.spyOn(FluxNodeRunRegistry.prototype, "add").mockImplementationOnce(() => { throw registrationError; });
    const started = lane.fluxNodes.start(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec()), inputs: { title: "Atlas" } });
    if (releaseFails) await expect(started).rejects.toMatchObject({ errors: [registrationError, releaseError] });
    else await expect(started).rejects.toBe(registrationError);
    if (!lane.fluxNodes.close) throw new Error("The built-in service must own its shutdown.");
    if (releaseFails) await expect(lane.fluxNodes.close()).rejects.toMatchObject({ errors: [releaseError] });
    else await lane.fluxNodes.close();
    expect(released()).toBe(1);
    expect(f.leaves).toHaveLength(0);
  });

  it("refuses absent or different runtime bindings before acquiring any host", async () => {
    const f = fixture();
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    expect(() => createFluxNodeService({ service: lane.service, hosts: f.pool })).toThrow("domain_mismatch");
    expect(() => createFluxNodeService({ service: lane.service, domainId: "other", hosts: f.pool })).toThrow("domain_mismatch");
    const missing = fluxNodeSpecSchema.parse(findLoansSpec());
    Reflect.deleteProperty(missing, "runtime"); // Also fail closed for a malformed in-process caller before wire validation.
    for (const spec of [missing, fluxNodeSpecSchema.parse(findLoansSpec({ runtime: "other" }))]) {
      expect(await lane.fluxNodes.start(OWNER, { spec, inputs: { title: "Atlas" } })).toMatchObject({ ok: false, refusal: { code: "invalid_request" } });
    }
    expect(f.leaves).toHaveLength(0);
  });

  it.each([
    { runtime: "other", nested: false },
    { runtime: "other", nested: true },
    { runtime: undefined, nested: false },
    { runtime: undefined, nested: true }
  ])("refuses a pipeline leaf runtime $runtime before admission, nested: $nested", async ({ runtime, nested }) => {
    const f = fixture();
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    const owner = vi.spyOn(acts, "fluxNodeExecutionOwner");
    const spec = fluxNodeSpecSchema.parse(findLoansSpec({ name: "library.unserved-leaf", runtime: "other" }));
    if (runtime === undefined) Reflect.deleteProperty(spec, "runtime");
    expect(await lane.fluxNodes.register(OWNER, { spec })).toMatchObject({ ok: true });
    const child = parseDataPipeline({ name: "library.unserved-child", source: { kind: "input", field: "titles" },
      steps: [{ id: "find", kind: "map", target: { fluxNode: spec.name }, inputs: { title: { field: "title" } }, as: "found" }] });
    if (!child.ok) throw new Error("The fixture child pipeline is invalid.");
    if (nested) expect(await lane.fluxNodes.register(OWNER, { pipeline: child.value })).toMatchObject({ ok: true });
    const parent = nested ? parseDataPipeline({ name: "library.unserved-parent", source: { kind: "input", field: "batches" },
      steps: [{ id: "batch", kind: "map", target: { fluxNode: child.value.name }, inputs: { titles: { field: "titles" } }, as: "found" }] }) : child;
    if (!parent.ok) throw new Error("The fixture parent pipeline is invalid.");
    try {
      const started = await lane.fluxNodes.start(OWNER, { pipeline: parent.value, inputs: nested ? { batches: [{ titles: [{ title: "Atlas" }] }] } : { titles: [{ title: "Atlas" }] } });
      expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("runtime") } });
      expect(owner).not.toHaveBeenCalled();
      expect(await lane.fluxNodes.list(OWNER, { limit: 20 })).toMatchObject({ ok: true, value: { runs: [] } });
      expect(f.leaves).toHaveLength(0);
    } finally {
      await lane.fluxNodes.close?.();
    }
  });

  it("instance shutdown waits for parent pipeline owner cleanup after its leaf releases", async () => {
    const f = fixture();
    const parentRelease = deferred();
    const finishParent = deferred();
    const released = owners(async (ordinal) => {
      if (ordinal !== 0) return;
      parentRelease.resolve();
      await finishParent.promise;
    });
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec({ hasCheck: false, options: { judge: "off" } })) });
    const pipeline = parseDataPipeline({ name: "library.shutdown-report", source: { kind: "input", field: "titles" },
      steps: [{ id: "find", kind: "map", target: { fluxNode: "library.find-loans" }, inputs: { title: { field: "title" } }, as: "found" }] });
    if (!pipeline.ok) throw new Error("The fixture pipeline is invalid.");
    const running = lane.run({ pipeline: pipeline.value, inputs: { titles: [{ title: "Atlas" }] } }, { script: [findLoans("Atlas"), complete("Found.")] });
    const service = lane.fluxNodes as typeof lane.fluxNodes & { close?: () => Promise<void> };
    let closing: Promise<void> | undefined;
    try {
      await Promise.race([parentRelease.promise, running.then(() => { throw new Error("The controller ended before its owner cleanup was observed."); })]);
      expect(f.bound.size).toBe(0);
      let closed = false;
      closing = (async () => {
        await service.close?.();
        await f.pool.close();
        closed = true;
      })();
      await setImmediate();
      expect(closed).toBe(false);
      finishParent.resolve();
      await closing;
      await running;
      expect(released()).toBe(2);
      expect(f.releases()).toBe(1);
    } finally {
      finishParent.resolve();
      await running;
      await closing;
    }
  });

  it("closing refuses new specs, named runs and resumes without taking another host", async () => {
    const f = fixture();
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    if (!lane.fluxNodes.close) throw new Error("The built-in service must own its shutdown.");
    await lane.fluxNodes.close();
    const refusal = { ok: false, refusal: { code: "invalid_request", message: "The FluxNode service is closing." } };
    expect(await lane.fluxNodes.start(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec()), inputs: { title: "Atlas" } })).toMatchObject(refusal);
    expect(await lane.fluxNodes.start(OWNER, { name: "library.find-loans", inputs: { title: "Atlas" } })).toMatchObject(refusal);
    expect(await lane.fluxNodes.start(OWNER, { resumeHandle: "resume.prior-run" })).toMatchObject(refusal);
    expect(f.leaves).toHaveLength(0);
  });

  it("shutdown reports owner-release failure after draining unrelated success without replacing run results", async () => {
    const f = fixture();
    const ownerError = new RangeError("owner release failed");
    const ownerEntered = deferred();
    const finishOwner = deferred();
    const released = owners(async (ordinal) => {
      if (ordinal === 0) throw ownerError;
      ownerEntered.resolve();
      await finishOwner.promise;
    });
    const lane = await fluxNodeLane(cleanups, { hosts: f.pool });
    vi.spyOn(lane.service, "generateFlowBootstrapAdaptation").mockRejectedValueOnce(new TypeError("attempt failed"));
    const run = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } });
    expect(run.result.status).toBe("stopped");
    expect(run.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "step", stepId: "execution.ownership", label: expect.stringContaining("RangeError") }),
      expect.objectContaining({ type: "step", stepId: "fluxnode.run", label: expect.stringContaining("TypeError") })
    ]));
    expect(released()).toBe(1);
    expect(f.releases()).toBe(1);
    const unrelated = lane.run({ spec: findLoansSpec({ name: "library.unrelated-cleanup", hasCheck: false, options: { judge: "off" } }), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found.")] });
    let closing: Promise<void> | undefined;
    try {
      await Promise.race([ownerEntered.promise, unrelated.then(() => { throw new Error("The unrelated run ended before its owner cleanup was observed."); })]);
      if (!lane.fluxNodes.close) throw new Error("The built-in service must own its shutdown.");
      closing = lane.fluxNodes.close();
      expect(lane.fluxNodes.close()).toBe(closing);
      let closed = false;
      void closing.then(() => { closed = true; }, () => { closed = true; });
      await setImmediate();
      expect(closed).toBe(false);
      expect(f.bound.size).toBe(1);
      finishOwner.resolve();
      await expect(closing).rejects.toMatchObject({ errors: [ownerError] });
      expect((await unrelated).result.status).toBe("achieved");
      expect(await lane.fluxNodes.get(OWNER, run.result.runId)).toMatchObject({ ok: true, value: { result: run.result } });
      expect(lane.fluxNodes.close()).toBe(closing);
      await expect(closing).rejects.toMatchObject({ errors: [ownerError] });
      expect(released()).toBe(2);
      expect(f.releases()).toBe(2);
      expect(f.bound.size).toBe(0);
    } finally {
      finishOwner.resolve();
      await unrelated;
      await closing?.catch(/* best-effort: the shutdown rejection is asserted above; this only drains fixture cleanup */ () => undefined);
    }
  });
});
