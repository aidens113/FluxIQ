import type { IamAuditRecord, IamAuditSink } from "fluxiq/platform";
import { describe, expect, it, vi } from "vitest";
import { DeferredIamAuditSink } from "../deferred-audit-sink";

function auditRecord(requestId: string): IamAuditRecord {
  return { category: "allow", time: 0, requestId, principal: "user/dummy", action: "programs:Read", resources: [], decision: "allow", matched: "implicit", origin: "panel", ipPrefix: null };
}

function memorySink(): IamAuditSink & { rows: string[]; flushes: number } {
  const sink = {
    rows: [] as string[],
    flushes: 0,
    record: (row: IamAuditRecord) => { sink.rows.push(row.requestId); },
    flush: async () => { sink.flushes += 1; }
  };
  return sink;
}

describe("DeferredIamAuditSink", () => {
  it("keeps records until the real sink opens, then hands them over in order and forwards the rest", async () => {
    const target = memorySink();
    let open!: (sink: IamAuditSink) => void;
    const deferred = new DeferredIamAuditSink(() => new Promise((resolve) => { open = resolve; }));
    deferred.record(auditRecord("a"));
    deferred.record(auditRecord("b"));
    expect(deferred.pendingRecords).toBe(2);
    open(target);
    await deferred.flush();
    deferred.record(auditRecord("c"));
    expect(target.rows).toEqual(["a", "b", "c"]);
    expect(target.flushes).toBe(1);
    expect(deferred.pendingRecords).toBe(0);
  });

  it("bounds what it keeps: past the limit the oldest is dropped and counted", async () => {
    const target = memorySink();
    let open!: (sink: IamAuditSink) => void;
    const deferred = new DeferredIamAuditSink(() => new Promise((resolve) => { open = resolve; }), { maxPending: 2 });
    for (const id of ["a", "b", "c", "d"]) deferred.record(auditRecord(id));
    expect(deferred.pendingRecords).toBe(2);
    expect(deferred.droppedRecords).toBe(2);
    open(target);
    await deferred.flush();
    expect(target.rows).toEqual(["c", "d"]);
  });

  it("tries a failed open again on the next record, reports the failure, and never throws from record", async () => {
    const target = memorySink();
    const onError = vi.fn();
    const resolve = vi.fn<() => Promise<IamAuditSink>>().mockRejectedValueOnce(new Error("store unavailable")).mockResolvedValue(target);
    const deferred = new DeferredIamAuditSink(resolve, { onError });
    expect(() => deferred.record(auditRecord("a"))).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    deferred.record(auditRecord("b"));
    await deferred.flush();
    expect(target.rows).toEqual(["a", "b"]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("opens nothing on a flush when nothing was recorded", async () => {
    const resolve = vi.fn(async () => memorySink());
    await new DeferredIamAuditSink(resolve).flush();
    expect(resolve).not.toHaveBeenCalled();
  });
});
