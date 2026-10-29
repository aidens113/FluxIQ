// @fluxiq-test-group real-sql
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IamAuditRecord } from "../../types.ts";
import { BufferedIamAuditSink } from "../buffered-sink.ts";
import { MemoryIamAuditSink } from "../memory-sink.ts";
import { IamAuditStore } from "../store.ts";

function record(over: Partial<IamAuditRecord> = {}): IamAuditRecord {
  return {
    category: "allow",
    time: 1_790_000_000,
    requestId: "1",
    principal: "p",
    action: "a",
    resources: ["r"],
    decision: "allow",
    matched: "implicit",
    origin: "api",
    ipPrefix: null,
    ...over
  };
}

let dir = "";
let store: IamAuditStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "iam-audit-sink-"));
  store = await IamAuditStore.open(path.join(dir, "audit.db"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("BufferedIamAuditSink", () => {
  it("holds allows until flush, and flush drains them", async () => {
    const sink = new BufferedIamAuditSink(store);
    sink.record(record());
    expect(await store.read()).toEqual([]);
    expect(sink.bufferedRows).toBe(1);
    await sink.flush();
    expect(await store.read()).toHaveLength(1);
    await sink.close();
  });

  it("flushes after 1 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sink = new BufferedIamAuditSink(store);
    sink.record(record());
    await vi.advanceTimersByTimeAsync(999);
    expect(sink.bufferedRows).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(sink.bufferedRows).toBe(0);
    vi.useRealTimers();
    await sink.flush();
    expect(await store.read()).toHaveLength(1);
  });

  it("flushes at 100 buffered rows", async () => {
    const sink = new BufferedIamAuditSink(store);
    for (let i = 0; i < 99; i += 1) sink.record(record({ requestId: String(i) }));
    expect(sink.bufferedRows).toBe(99);
    sink.record(record({ requestId: "99" }));
    expect(sink.bufferedRows).toBe(0);
    await sink.flush();
    expect(await store.read({ limit: 500 })).toHaveLength(100);
  });

  it("flushes a deny at once, with the buffered allows before it", async () => {
    const sink = new BufferedIamAuditSink(store);
    sink.record(record());
    sink.record(record({ category: "deny", decision: "deny", requestId: "2" }));
    expect(sink.bufferedRows).toBe(0);
    await sink.flush();
    expect(await store.read()).toHaveLength(2);
  });

  it("unrefs its timer", () => {
    const sink = new BufferedIamAuditSink(store);
    const unref = vi.fn();
    const clock = vi.spyOn(globalThis, "setTimeout").mockReturnValue({ unref } as unknown as ReturnType<typeof setTimeout>);
    sink.record(record());
    clock.mockRestore();
    expect(unref).toHaveBeenCalled();
  });

  it("surfaces a flush failure, retries the rows, and never throws from record", async () => {
    const errors: Error[] = [];
    const sink = new BufferedIamAuditSink(store, { onError: (error) => errors.push(error) });
    vi.spyOn(store, "write").mockRejectedValueOnce(new Error("disk full"));
    expect(() => sink.record(record({ category: "deny", decision: "deny" }))).not.toThrow();
    await sink.flush().catch((error: unknown) => errors.push(error as Error));
    expect(errors.map((e) => e.message)).toContain("disk full");
    await sink.flush();
    expect(await store.read()).toHaveLength(1);
  });

  it("rejects close while rows still cannot be written, and counts dropped rows", async () => {
    const sink = new BufferedIamAuditSink(store, { retainedRows: 2 });
    vi.spyOn(store, "write").mockRejectedValue(new Error("down"));
    for (let i = 0; i < 4; i += 1) sink.record(record({ requestId: String(i) }));
    await expect(sink.close()).rejects.toThrow("down");
    expect(sink.droppedRows).toBe(2);
    expect(sink.bufferedRows).toBe(2);
  });
});

describe("MemoryIamAuditSink", () => {
  it("keeps records in order", async () => {
    const sink = new MemoryIamAuditSink();
    sink.record(record({ requestId: "1" }));
    sink.record(record({ requestId: "2" }));
    await sink.flush();
    expect(sink.records.map((r) => r.requestId)).toEqual(["1", "2"]);
  });
});
