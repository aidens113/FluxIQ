import { describe, expect, it, vi } from "vitest";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { bindPartialTrialContext } from "../index.ts";
import { partialAdmissionFixture } from "./fixture.ts";

describe("an actual admitted parent owns the partial callback child", () => {
  it("does not create a nested committing reservation or finish its caller's root", async () => {
    const persistence = new AdmissionTestPersistence();
    let calls = 0;
    const f = await partialAdmissionFixture({ persistence, noDispatch: true, port: async request => {
      calls += 1;
      return { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: {}, entryPrepared: true };
    } });
    const root = new AdmissionTestSource(f.executionScope, "actual.outer.root");
    root.delegatesTo.push(f.callbacks.owner);
    const ports = f.assembly.registerSource(root);
    const origin = root.origin();
    const reserved = await f.assembly.consumer.reserve(f.executionScope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)));
    const reserve = vi.spyOn(f.configured, "reserve");
    bindPartialTrialContext(f.gate, { parent: { reservation: reserved.reservation, parent: reserved.root }, callbacks: f.callbacks, automation: undefined });
    const result = await f.gate.test(f.receipt());
    expect(result).toMatchObject({ evidence: { verdict: "unsure" } });
    expect(calls).toBe(1);
    expect(reserve).not.toHaveBeenCalled();
    const outer = f.assembly.entryBridge.read(reserved.root);
    expect(persistence.rows.get(outer.row.entryId)?.closed).toBe(false);
    expect([...persistence.rows.values()].filter(row => row.row.parentId === outer.row.entryId)).toHaveLength(1);
    expect([...persistence.rows.values()].filter(row => row.row.sourceKey === "candidate.actual.callbacks").every(row => row.closed)).toBe(true);
    await ports.producer.finish(reserved.root, root.complete(origin));
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
  });

  it("does no admission or effectful work for a stale receipt or already aborted invocation", async () => {
    let calls = 0;
    const f = await partialAdmissionFixture({ port: async () => {
      calls += 1;
      throw new Error("invalid invocations cannot call a partial port");
    } });
    const reserve = vi.spyOn(f.configured, "reserve");
    expect(await f.gate.test({ ...f.receipt(), digest: "stale" })).toMatchObject({ resultCode: "subflow.trial_stale_revision" });
    const abort = new AbortController();
    abort.abort();
    await expect(f.gate.test(f.receipt(), abort.signal)).rejects.toThrow();
    expect(calls).toBe(0);
    expect(reserve).not.toHaveBeenCalled();
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
  });

  it("holds the exact gate single-flight before any awaited callback", async () => {
    let calls = 0;
    let finish: (() => void) | undefined;
    let reached: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const f = await partialAdmissionFixture({ noDispatch: true, port: async request => {
      calls += 1;
      reached?.();
      await waiting;
      return { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: {}, entryPrepared: true };
    } });
    const first = f.gate.test(f.receipt());
    await entered;
    await expect(f.gate.test(f.receipt())).rejects.toThrow("subflow.trial_in_flight");
    expect(calls).toBe(1);
    finish?.();
    await first;
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
  });
});
