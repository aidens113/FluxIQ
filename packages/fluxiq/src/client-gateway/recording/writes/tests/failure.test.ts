import { afterEach, expect, it, vi } from "vitest";
import { ClientRecordingWriteOrder } from "../index.ts";

type Item = { recordingId: string; label: string };
afterEach(() => vi.useRealTimers());

it("rejects awaited failed batches, never reinserts removed entries, and stores later work", async () => {
  const cause = new Error("append failed");
  const writes: string[][] = [];
  const order = new ClientRecordingWriteOrder<Item>(async (_address, items) => {
    writes.push(items.map(item => item.label));
    if (writes.length === 1) throw cause;
  });
  order.enqueue("owner", { recordingId: "one", label: "failed" });
  await expect(order.flush("owner")).rejects.toBe(cause);
  order.enqueue("owner", { recordingId: "one", label: "later" });
  await order.flush("owner");
  await order.flush("owner");
  expect(writes).toEqual([["failed"], ["later"]]);
});

it("awaits failure observation and preserves write and observer causes without a retry", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const observing = new Promise<void>(resolve => { entered = resolve; });
  const cause = new Error("write failed");
  const observerCause = new Error("failure observer failed");
  const write = vi.fn(async () => { throw cause; });
  const observer = vi.fn(async () => {
    entered();
    await gate;
    throw observerCause;
  });
  const order = new ClientRecordingWriteOrder<Item>(write, observer);
  order.enqueue("owner", { recordingId: "one", label: "entry" });
  await vi.advanceTimersByTimeAsync(25);
  await observing;
  let settled = false;
  const flushed = order.flush("owner").then(() => ({ kind: "stored" }), error => ({ kind: "failed", error })).finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  const result = await flushed;
  expect(result.kind).toBe("failed");
  if (!("error" in result) || !(result.error instanceof AggregateError)) throw new Error("test.expected_aggregate");
  expect(result.error.errors).toEqual([cause, observerCause]);
  expect(observer).toHaveBeenCalledWith({ ownerKey: "owner", recording: { recordingId: "one" }, entryCount: 1, cause });
  await order.flush("owner");
  expect(write).toHaveBeenCalledTimes(1);
});
