import { describe, expect, it } from "vitest";
import { admissionFixture } from "./fixture.ts";

describe("execution admission ordering and cancellation", () => {
  it("consumes evidence synchronously and cannot replay it while persistence waits", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const proof = f.source.prove(f.origin, { kind: "command_delivery", commandId: "actual", claimDigest: "claim", receiptDigest: "receipt" });
    const pause = f.store.pauseNext("append");
    const writing = f.ports.producer.observe(reserved.root, proof);
    expect(f.source.calls.at(-1)).toBe("evidence");
    await expect(f.ports.producer.observe(reserved.root, proof)).rejects.toThrow("evidence_spent");
    await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("entry_not_finishable");
    await pause.entered;
    expect(f.store.requests.filter(value => value.operation === "append")).toHaveLength(1);
    pause.release();
    await writing;
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
    expect(f.store.events.filter(value => value === "finish")).toHaveLength(1);
  });

  it("locks a parent synchronously against a new child while authentic closure persists", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const proof = f.source.complete(f.origin);
    const pause = f.store.pauseNext("finish");
    const finishing = f.ports.producer.finish(reserved.root, proof);
    expect(f.assembly.entryBridge.read(reserved.root).lifecycle).toBe("finishing");
    await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("parent_not_open");
    await expect(f.ports.producer.finish(reserved.root, proof)).rejects.toThrow("entry_not_open");
    await pause.entered;
    pause.release();
    await finishing;
    expect(f.assembly.entryBridge.read(reserved.root).lifecycle).toBe("closed");
    expect(f.store.requests.filter(value => value.operation === "enter")).toHaveLength(0);
    expect(f.store.requests.filter(value => value.operation === "finish")).toHaveLength(1);
  });

  it("refuses closure while a child entry is pending and derives its later persisted frontier", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const origin = f.source.origin();
    const pause = f.store.pauseNext("enter");
    const entering = f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("children_unfinished");
    await pause.entered;
    pause.release();
    const child = await entering;
    await f.ports.producer.finish(child, f.source.complete(origin));
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
    const rootId = f.assembly.entryBridge.read(reserved.root).row.entryId;
    expect(f.store.rows.get(rootId)?.frontier).toEqual([f.assembly.entryBridge.read(child).row.entryId]);
  });

  it("lets the transactional persistence fence choose at most one concurrent root", async () => {
    const f = await admissionFixture();
    const origin = f.source.origin();
    const secondGrant = f.ports.issuer.fromOrdinaryAdmission(f.source.admit(origin));
    const pause = f.store.pauseNext("reserve");
    const first = f.assembly.consumer.reserve(f.scope, f.grant);
    await pause.entered;
    const second = f.assembly.consumer.reserve(f.scope, secondGrant);
    pause.release();
    await first;
    await expect(second).rejects.toThrow("store.blocked");
    expect(f.store.rows.size).toBe(1);
  });

  it("leaves an aborted reservation pending after a durable write, never auto-finishes it", async () => {
    const f = await admissionFixture();
    const controller = new AbortController();
    const pause = f.store.pauseNext("reserve");
    const reserving = f.assembly.consumer.reserve(f.scope, f.grant, controller.signal);
    await pause.entered;
    controller.abort(new Error("private abort detail"));
    pause.release();
    await expect(reserving).rejects.toThrow("execution_admission.aborted");
    expect(f.store.rows.size).toBe(1);
    expect([...f.store.rows.values()][0]?.closed).toBe(false);
    expect(f.store.events).toEqual(["open", "reserve", "append", "release"]);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  });

  it("stops live capabilities synchronously on abort and release never seals", async () => {
    const f = await admissionFixture();
    const controller = new AbortController();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant, controller.signal);
    controller.abort();
    expect(f.assembly.entryBridge.read(reserved.root).reservationActive).toBe(false);
    await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("reservation_not_active");
    await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("entry_not_finishable");
    const first = f.assembly.consumer.release(reserved.reservation);
    const second = f.assembly.consumer.release(reserved.reservation);
    expect(second).toBe(first);
    await first;
    expect(f.store.events.filter(value => value === "release")).toHaveLength(1);
    expect(f.store.events.filter(value => value === "finish")).toHaveLength(0);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  });

  it("does not expose a child invocation when abort wins its entry write", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const controller = new AbortController();
    const pause = f.store.pauseNext("enter");
    let called = 0;
    const entering = f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin(), controller.signal).then(() => { called++; });
    await pause.entered;
    controller.abort();
    pause.release();
    await expect(entering).rejects.toThrow("aborted");
    expect(called).toBe(0);
    expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
    expect(f.store.events.includes("finish")).toBe(false);
  });

  it("does not substitute clear after failed reads or clear open coverage after failed release", async () => {
    const f = await admissionFixture();
    f.store.failNext("inspect");
    await expect(f.assembly.consumer.inspect(f.scope)).rejects.toThrow("inspect_failed");
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    f.store.failNext("release");
    await expect(f.assembly.consumer.release(reserved.reservation)).rejects.toThrow("release_failed");
    expect(f.assembly.entryBridge.read(reserved.root).reservationActive).toBe(false);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    expect(f.store.events.includes("finish")).toBe(false);
  });

  it("captures original proof readers instead of trusting later method replacement", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    f.source.consumeEvidence = () => ({ kind: "coverage_complete", disposition: "unacted", completionDigest: "forged", assessmentDigest: "forged" });
    await expect(f.ports.producer.finish(reserved.root, {})).rejects.toThrow("invalid_evidence");
    expect(f.store.events.includes("finish")).toBe(false);
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
    expect(f.store.events.filter(value => value === "finish")).toHaveLength(1);
  });

  it("awaits rejected abort cleanup, releases orderly and surfaces all original causes", async () => {
    for (const failRelease of [false, true]) {
      const f = await admissionFixture();
      const controller = new AbortController();
      const reserved = await f.assembly.consumer.reserve(f.scope, f.grant, controller.signal);
      const pause = f.store.pauseNext("append");
      const appendFailure = f.store.failNext("append");
      controller.abort();
      await pause.entered;
      const releaseFailure = failRelease ? f.store.failNext("release") : undefined;
      let completed = false;
      const releasing = f.assembly.consumer.release(reserved.reservation).then(
        () => {
          completed = true;
          return null;
        },
        (error: unknown) => {
          completed = true;
          return error;
        }
      );
      await Promise.resolve();
      expect(completed).toBe(false);
      await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("reservation_not_active");
      pause.release();
      const error = await releasing;
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual(releaseFailure ? [appendFailure, releaseFailure] : [appendFailure]);
      expect((error as AggregateError).errors[0]).toBe(appendFailure);
      if (releaseFailure) expect((error as AggregateError).errors[1]).toBe(releaseFailure);
      expect(f.store.events).toEqual(["open", "reserve", "append", "release"]);
      expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
      expect(f.assembly.entryBridge.read(reserved.root).reservationActive).toBe(false);
      const reopened = await admissionFixture({ store: f.store, runId: "run.after.abort" });
      await expect(reopened.assembly.consumer.reserve(reopened.scope, reopened.grant)).rejects.toThrow("store.blocked");
    }
  });

  it("returns the original caller-owned persistence error unchanged", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const failure = f.store.failNext("append");
    const proof = f.source.prove(f.origin, { kind: "command_delivery", commandId: "actual", claimDigest: "actual", receiptDigest: "actual" });
    await expect(f.ports.producer.observe(reserved.root, proof)).rejects.toBe(failure);
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  });
});
