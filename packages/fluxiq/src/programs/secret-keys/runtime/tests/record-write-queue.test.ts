import { describe, expect, it } from "vitest";
import { RecordWriteQueue } from "../record-write-queue.ts";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve: () => resolve() };
}

describe("RecordWriteQueue", () => {
  it("runs one record's writes in queue order even when an earlier write is slower, without holding other records", async () => {
    const queue = new RecordWriteQueue();
    const order: string[] = [];
    const slow = deferred();

    const first = queue.enqueue("secret:one", async () => {
      await slow.promise;
      order.push("first");
    });
    const second = queue.enqueue("secret:one", async () => {
      order.push("second");
      return true;
    });
    await queue.enqueue("secret:two", async () => {
      order.push("other");
    });

    expect(order).toEqual(["other"]);
    slow.resolve();
    await expect(second).resolves.toBe(true);
    await first;
    expect(order).toEqual(["other", "first", "second"]);
  });

  it("does not let a failed write block the next, and forgets a record once its writes finish", async () => {
    const queue = new RecordWriteQueue();

    const failed = queue.enqueue("secret:one", async () => {
      throw new Error("dummy write failure");
    });
    const next = queue.enqueue("secret:one", async () => "written");

    await expect(failed).rejects.toThrow("dummy write failure");
    await expect(next).resolves.toBe("written");
    await new Promise((resolve) => setImmediate(resolve));
    expect(queue.pendingRecordCount()).toBe(0);
  });
});
