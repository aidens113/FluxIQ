import { describe, expect, it } from "vitest";
import type { VerifiedExecutionEvidence } from "../index.ts";
import { admissionFixture } from "./fixture.ts";

describe("execution coverage lifecycle", () => {
  it("awaits durable reserve/entry before exposing invocation handles", async () => {
    const f = await admissionFixture();
    const pause = f.store.pauseNext("reserve");
    let exposed = false;
    const reserving = f.assembly.consumer.reserve(f.scope, f.grant).then(value => {
      exposed = true;
      return value;
    });
    await pause.entered;
    expect(exposed).toBe(false);
    expect(f.store.rows.size).toBe(0);
    pause.release();
    const reserved = await reserving;
    const enteringPause = f.store.pauseNext("enter");
    let invoked = 0;
    const entering = f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin()).then(value => {
      invoked++;
      return value;
    });
    await enteringPause.entered;
    expect(invoked).toBe(0);
    enteringPause.release();
    await entering;
    expect(invoked).toBe(1);
    expect(f.store.events).toEqual(["open", "reserve", "enter"]);
  });

  it("keeps unknown/required latches across release, new revision/run and reopened authority", async () => {
    for (const kind of ["terminal_unknown", "required_latched"] as const) {
      const f = await admissionFixture({ series: true, runId: "run.first" });
      const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
      await f.ports.producer.observe(reserved.root, f.source.prove(f.origin, { kind, code: "actual.unknown" }));
      await f.assembly.consumer.release(reserved.reservation);
      await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("entry_not_finishable");
      const reopened = await admissionFixture({ store: f.store, series: true, runId: "run.changed" });
      await expect(reopened.assembly.consumer.reserve(reopened.scope, reopened.grant)).rejects.toThrow("store.blocked");
      expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe(kind === "required_latched" ? "required_latched" : "pending");
      expect(f.store.events.filter(value => value === "finish")).toHaveLength(0);
    }
  });

  it("preserves first ordinary unverified execution while withholding later trial credit", async () => {
    const f = await admissionFixture({ baseline: "unverified", series: true });
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const childOrigin = f.source.origin();
    const child = await f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, childOrigin);
    await f.ports.producer.observe(child, f.source.prove(childOrigin, { kind: "returned_unverified", completionDigest: "actual.legacy.return" }));
    await f.ports.producer.observe(reserved.root, f.source.prove(f.origin, { kind: "returned_unverified", completionDigest: "actual.legacy.trial" }));
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("unverified");
    const reopened = await admissionFixture({ store: f.store, baseline: "unverified", series: true });
    await expect(reopened.assembly.consumer.reserve(reopened.scope, reopened.grant)).rejects.toThrow("unverified_reentry");
    expect(f.store.events.filter(value => value === "enter")).toHaveLength(1);
  });

  it("requires real handling consumption after delivery and derives children from persistence", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const childOrigin = f.source.origin();
    const child = await f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, childOrigin);
    const childId = f.assembly.entryBridge.read(child).row.entryId;
    f.store.required.add(childId);
    await f.ports.producer.observe(child, f.source.prove(childOrigin, { kind: "command_delivery", commandId: "command.actual", claimDigest: "claim.actual", receiptDigest: "receipt.actual" }));
    await f.ports.producer.observe(child, f.source.prove(childOrigin, { kind: "required_consumed", commandId: "command.actual", handlingDigest: "handling.actual" }));
    await f.ports.producer.finish(child, f.source.complete(childOrigin));
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
    const request = f.store.requests.find(value => value.operation === "finish")?.value as { evidence: object };
    expect(Object.hasOwn(request.evidence, "childFrontierDigest")).toBe(false);
    expect(f.store.rows.get(f.assembly.entryBridge.read(reserved.root).row.entryId)?.frontier).toEqual([childId]);
  });

  it("does not close on a receipt or missing required handling", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const id = f.assembly.entryBridge.read(reserved.root).row.entryId;
    f.store.required.add(id);
    await f.ports.producer.observe(reserved.root, f.source.prove(f.origin, { kind: "command_delivery", commandId: "command.actual", claimDigest: "claim", receiptDigest: "receipt" }));
    expect(f.store.rows.get(id)?.closed).toBe(false);
    await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("handling_missing");
    expect(f.assembly.entryBridge.read(reserved.root).lifecycle).toBe("blocked");
    expect(f.store.rows.get(id)?.closed).toBe(false);
  });

  it("freezes source evidence before asynchronous persistence observes it", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const raw = { kind: "command_delivery" as const, commandId: "actual.command", claimDigest: "actual.claim", receiptDigest: "actual.receipt" };
    const pause = f.store.pauseNext("append");
    const writing = f.ports.producer.observe(reserved.root, f.source.prove(f.origin, raw));
    raw.receiptDigest = "mutated.after.consume";
    await pause.entered;
    const forwarded = f.store.requests.at(-1)?.value as { evidence: VerifiedExecutionEvidence };
    expect(Object.isFrozen(forwarded)).toBe(true);
    expect(Object.isFrozen(forwarded.evidence)).toBe(true);
    expect(forwarded.evidence).toMatchObject({ receiptDigest: "actual.receipt" });
    pause.release();
    await writing;
  });

  it("keeps coverage open on reserve/entry/append/finish failures without fallback sealing", async () => {
    for (const operation of ["reserve", "enter", "append", "finish"] as const) {
      const f = await admissionFixture();
      if (operation === "reserve") {
        f.store.failNext(operation);
        await expect(f.assembly.consumer.reserve(f.scope, f.grant)).rejects.toThrow("reserve_failed");
        await expect(f.assembly.consumer.reserve(f.scope, f.grant)).rejects.toThrow("grant_spent_or_foreign");
        continue;
      }
      const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
      f.store.failNext(operation);
      if (operation === "enter") {
        await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("enter_failed");
      } else if (operation === "append") {
        await expect(f.ports.producer.observe(reserved.root, f.source.prove(f.origin, { kind: "returned_unverified", completionDigest: "actual" }))).rejects.toThrow("append_failed");
      } else {
        await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("finish_failed");
      }
      expect(f.store.rows.get(f.assembly.entryBridge.read(reserved.root).row.entryId)?.closed).toBe(false);
      await expect(f.ports.producer.finish(reserved.root, f.source.complete(f.origin))).rejects.toThrow("entry_not_finishable");
      await f.assembly.consumer.release(reserved.reservation);
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    }
  });

  it("retains pending interruption until an actual private no-effect witness closes it", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    await f.ports.producer.interrupted(reserved.root, "callback_threw");
    await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("pending_interruption");
    await expect(f.ports.producer.finish(reserved.root, { kind: "coverage_complete", disposition: "unacted", completionDigest: "json", assessmentDigest: "json" })).rejects.toThrow("invalid_evidence");
    await f.ports.producer.finish(reserved.root, f.source.prove(f.origin, { kind: "coverage_complete", disposition: "unacted", completionDigest: "actual", assessmentDigest: "canonical.no_effect" }));
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it("keeps a failed delivery observer open across a different continuation on the same resource", async () => {
    const f = await admissionFixture({ runId: "run.original" });
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const proof = f.source.prove(f.origin, { kind: "command_delivery", commandId: "committed.remote", claimDigest: "real.claim", receiptDigest: "real.receipt" });
    f.store.failNext("append");
    await expect(f.ports.producer.observe(reserved.root, proof)).rejects.toThrow("append_failed");
    await expect(f.ports.producer.observe(reserved.root, proof)).rejects.toThrow("evidence_spent");
    await f.assembly.consumer.release(reserved.reservation);
    const other = await admissionFixture({ store: f.store, continuation: "other.persisted.flow", runId: "run.new" });
    await expect(other.assembly.consumer.reserve(other.scope, other.grant)).rejects.toThrow("store.blocked");
    expect(f.store.events.filter(value => value === "finish")).toHaveLength(0);
  });
});
