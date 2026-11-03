import { describe, expect, it } from "vitest";
import { ClientRecordingWriteOrder } from "../client-recording-write-order.ts";

type QueuedItem = { projectId?: string | null; recordingId: string; label: string };

function heldPromise() {
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = () => resolve(); });
  return { held, release: () => release() };
}

describe("ClientRecordingWriteOrder", () => {
  it("runs one owner's steps in the order they were queued, even when an earlier step is slower", async () => {
    const order = new ClientRecordingWriteOrder<QueuedItem>(async () => undefined);
    const ran: string[] = [];

    await Promise.all([
      order.run("owner", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        ran.push("slow first");
      }),
      order.run("owner", async () => { ran.push("quick second"); })
    ]);

    expect(ran).toEqual(["slow first", "quick second"]);
  });

  it("rejects only the step that failed, and still runs the step after it", async () => {
    const order = new ClientRecordingWriteOrder<QueuedItem>(async () => undefined);

    const failing = order.run("owner", async () => { throw new Error("append failed"); });
    const next = order.run("owner", async () => "stored");

    await expect(failing).rejects.toThrow("append failed");
    await expect(next).resolves.toBe("stored");
  });

  it("does not hold one owner's steps behind another owner's", async () => {
    const order = new ClientRecordingWriteOrder<QueuedItem>(async () => undefined);
    const gate = heldPromise();

    const held = order.run("owner.a", () => gate.held);

    await expect(order.run("owner.b", async () => "b")).resolves.toBe("b");
    gate.release();
    await held;
  });

  it("settles once the steps queued so far have, without waiting for a step queued later", async () => {
    const order = new ClientRecordingWriteOrder<QueuedItem>(async () => undefined);
    const gate = heldPromise();
    const ran: string[] = [];

    void order.run("owner", async () => { ran.push("before"); });
    const settled = order.settled("owner");
    const later = order.run("owner", async () => {
      await gate.held;
      ran.push("later");
    });

    await settled;
    expect(ran).toEqual(["before"]);
    gate.release();
    await later;
    expect(ran).toEqual(["before", "later"]);
  });

  it("writes queued items grouped by recording, and a flush during a write also waits for what was queued meanwhile", async () => {
    const gate = heldPromise();
    const writes: string[][] = [];
    const order = new ClientRecordingWriteOrder<QueuedItem>(async (recording, items) => {
      if (!writes.length) await gate.held;
      writes.push([recording.recordingId, ...items.map((item) => item.label)]);
    });

    order.enqueue("owner", { recordingId: "recording.1", label: "a" });
    order.enqueue("owner", { recordingId: "recording.2", label: "b" });
    order.enqueue("owner", { recordingId: "recording.1", label: "c" });
    const writing = order.flush("owner");
    order.enqueue("owner", { recordingId: "recording.1", label: "d" });
    const following = order.flush("owner");
    gate.release();
    await following;

    expect(writes).toEqual([["recording.1", "a", "c"], ["recording.2", "b"], ["recording.1", "d"]]);
    await writing;
  });
});
