import { describe, expect, it } from "vitest";
import {
  ClientGatewayOutbox,
  clientGatewayMemoryOutboxStore,
  clientGatewayOutboxEntryBytes,
  type ClientGatewayOutboxEntry
} from "../index.ts";
import { binding, stateUpdate } from "./messages.ts";

const own = binding("lineage.1", "project.1");

// A measure that reads a size the test chose, so budgets are exact.
const sizes = new Map<string, number>();
function sized(bytes: number) {
  const message = stateUpdate();
  sizes.set(message.id, bytes);
  return message;
}
const measure = (entry: ClientGatewayOutboxEntry) => sizes.get(entry.message.id) ?? 1;

describe("ClientGatewayOutbox byte budget", () => {
  it("drops the oldest entries past the byte budget, keeps the order, and counts each as byte_budget", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { byteBudget: 100, measure });
    const messages = [sized(40), sized(40), sized(40), sized(30)];
    for (const message of messages) await outbox.enqueue(message, own);
    const state = await store.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual([messages[2]!.id, messages[3]!.id]);
    expect(state.entries.map((queued) => queued.bytes)).toEqual([40, 30]);
    expect(state.lost).toEqual({ count: 2, byReason: { byte_budget: 2 } });
    expect(await outbox.lost()).toEqual({ count: 2, byReason: { byte_budget: 2 } });
  });

  it("never stores an entry that alone is over the budget, and keeps what was queued", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { byteBudget: 100, measure });
    const kept = sized(60);
    await outbox.enqueue(kept, own);
    expect(await outbox.enqueue(sized(101), own)).toBe(1);
    const state = await store.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual([kept.id]);
    expect(state.lost).toEqual({ count: 1, byReason: { byte_budget: 1 } });
  });

  it("counts entries dropped by the count limit as count_limit", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { limit: 2 });
    for (let index = 0; index < 5; index += 1) await outbox.enqueue(stateUpdate(), own);
    expect(await outbox.size()).toBe(2);
    expect((await store.read()).lost).toEqual({ count: 3, byReason: { count_limit: 3 } });
  });

  it("counts both reasons when both limits drop entries", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { limit: 2, byteBudget: 50, measure });
    await outbox.enqueue(sized(10), own);
    await outbox.enqueue(sized(10), own);
    await outbox.enqueue(sized(30), own);
    const last = sized(30);
    await outbox.enqueue(last, own);
    const state = await store.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual([last.id]);
    expect(state.lost).toEqual({ count: 3, byReason: { count_limit: 2, byte_budget: 1 } });
  });

  it("records no loss while both limits hold", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { limit: 5, byteBudget: 1_000_000 });
    await outbox.enqueue(stateUpdate(), own);
    expect((await store.read()).lost).toBeUndefined();
    expect(await outbox.lost()).toBeUndefined();
  });

  it("measures by default as the UTF-8 length of the entry's JSON, once, at enqueue", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store);
    const message = stateUpdate();
    await outbox.enqueue(message, own);
    const expected = new TextEncoder().encode(JSON.stringify({ binding: own, message })).length;
    expect(clientGatewayOutboxEntryBytes({ binding: own, message })).toBe(expected);
    expect((await store.read()).entries[0]!.bytes).toBe(expected);
  });

  it("counts multi-byte characters by their UTF-8 length", () => {
    const message = { ...stateUpdate(), payload: { state: { label: "é中" } } } as ReturnType<typeof stateUpdate>;
    const ascii = { ...message, payload: { state: { label: "ab" } } } as ReturnType<typeof stateUpdate>;
    expect(clientGatewayOutboxEntryBytes({ binding: own, message }) - clientGatewayOutboxEntryBytes({ binding: own, message: ascii })).toBe(3);
  });

  it("measures an entry read without a size before judging the budget", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const old = sized(80);
    await store.write({ entries: [{ binding: own, message: old }] });
    const outbox = new ClientGatewayOutbox(store, { byteBudget: 100, measure });
    const next = sized(30);
    await outbox.enqueue(next, own);
    const state = await store.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual([next.id]);
    expect(state.lost).toEqual({ count: 1, byReason: { byte_budget: 1 } });
  });

  it("adds to a loss already stored", async () => {
    const store = clientGatewayMemoryOutboxStore();
    await store.write({ entries: [], lost: { count: 2, byReason: { write_failed: 2 } } });
    const outbox = new ClientGatewayOutbox(store, { limit: 1 });
    await outbox.enqueue(stateUpdate(), own);
    await outbox.enqueue(stateUpdate(), own);
    expect((await store.read()).lost).toEqual({ count: 3, byReason: { write_failed: 2, count_limit: 1 } });
  });

  it("refuses a byte budget that is not a positive number", () => {
    const store = clientGatewayMemoryOutboxStore();
    expect(() => new ClientGatewayOutbox(store, { byteBudget: 0 })).toThrow();
    expect(() => new ClientGatewayOutbox(store, { byteBudget: -1 })).toThrow();
    expect(() => new ClientGatewayOutbox(store, { byteBudget: Number.NaN })).toThrow();
    expect(() => new ClientGatewayOutbox(store, { byteBudget: Number.POSITIVE_INFINITY })).not.toThrow();
  });
});
