import { afterEach, expect, it, vi } from "vitest";
import type { RecordingWriteTarget } from "../index.ts";
import { ClientRecordingWriteOrder } from "../index.ts";

type Item = { recordingId: string; projectId?: string; index: number };
afterEach(() => vi.useRealTimers());

it("starts background drain at 25ms or 50 entries, with no earlier timer write", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async (_address: RecordingWriteTarget, _items: Item[]) => undefined);
  const order = new ClientRecordingWriteOrder<Item>(write);
  order.enqueue("timer", { recordingId: "one", index: 0 });
  await vi.advanceTimersByTimeAsync(24);
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 50; index++) order.enqueue("threshold", { recordingId: "two", index });
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1]?.[1]).toHaveLength(50);
  await order.flush("threshold");
  await vi.advanceTimersByTimeAsync(25);
  expect(write).toHaveBeenCalledTimes(2);
});

it("keeps 100-entry splice limits and grouping insertion order while a write is held", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const batches: Item[][] = [];
  const order = new ClientRecordingWriteOrder<Item>(async (_address, items) => {
    batches.push(items);
    if (batches.length === 1) await gate;
  });
  for (let index = 0; index < 230; index++) order.enqueue("owner", { recordingId: "one", index });
  const flushed = order.flush("owner");
  expect(batches.map(batch => batch.length)).toEqual([50]);
  release();
  await flushed;
  expect(batches.map(batch => batch.length)).toEqual([50, 100, 80]);
  expect(batches.flat().map(item => item.index)).toEqual(Array.from({ length: 230 }, (_, index) => index));
});

it("groups identical recording IDs by project without reordering first-seen groups", async () => {
  const groups: string[][] = [];
  const order = new ClientRecordingWriteOrder<Item>(async (address, items) => { groups.push([address.projectId ?? "", ...items.map(item => String(item.index))]); });
  order.enqueue("owner", { projectId: "P", recordingId: "same", index: 1 });
  order.enqueue("owner", { projectId: "Q", recordingId: "same", index: 2 });
  order.enqueue("owner", { projectId: "P", recordingId: "same", index: 3 });
  await order.flush("owner");
  expect(groups).toEqual([["P", "1", "3"], ["Q", "2"]]);
});
