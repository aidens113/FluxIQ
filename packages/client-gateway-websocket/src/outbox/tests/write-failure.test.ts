import { describe, expect, it } from "vitest";
import { ClientGatewayOutbox, clientGatewayMemoryOutboxStore, type ClientGatewayOutboxState, type ClientGatewayOutboxStore } from "../index.ts";
import { binding, stateUpdate } from "./messages.ts";

const own = binding("lineage.1", "project.1");

// A store over memory whose writes throw while `refuse(state)` says so, the
// way a storage area over its quota refuses a write that is too large.
function refusingStore(refuse: (state: ClientGatewayOutboxState) => boolean) {
  const inner = clientGatewayMemoryOutboxStore();
  let attempts = 0;
  const store: ClientGatewayOutboxStore & { attempts(): number } = {
    read: () => inner.read(),
    async write(state) {
      attempts += 1;
      if (refuse(state)) throw new Error("The storage area is full.");
      await inner.write(state);
    },
    attempts: () => attempts
  };
  return { store, inner };
}

describe("ClientGatewayOutbox when the store refuses a write", () => {
  it("never throws: drops the oldest half until the write fits, keeps the order, and counts write_failed", async () => {
    let quota = Number.POSITIVE_INFINITY;
    const { store, inner } = refusingStore((state) => state.entries.length > quota);
    const outbox = new ClientGatewayOutbox(store);
    const messages = Array.from({ length: 8 }, () => stateUpdate());
    for (const message of messages.slice(0, 7)) await outbox.enqueue(message, own);
    quota = 3;
    // 8 entries refused, then 4 refused, then 2 fit: 4 + 2 dropped, oldest first.
    expect(await outbox.enqueue(messages[7]!, own)).toBe(2);
    const state = await inner.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual(messages.slice(6).map((message) => message.id));
    expect(state.lost).toEqual({ count: 6, byReason: { write_failed: 6 } });
  });

  it("holds a loss it could not write, and writes it with the next write that succeeds", async () => {
    let broken = false;
    const { store, inner } = refusingStore(() => broken);
    const outbox = new ClientGatewayOutbox(store);
    const first = stateUpdate();
    await outbox.enqueue(first, own);
    broken = true;
    // Even an empty queue cannot be written: the store keeps what it had, and only the new entry is lost.
    expect(await outbox.enqueue(stateUpdate(), own)).toBe(1);
    expect((await inner.read()).entries.map((queued) => queued.message.id)).toEqual([first.id]);
    expect((await inner.read()).lost).toBeUndefined();
    expect(await outbox.lost()).toEqual({ count: 1, byReason: { write_failed: 1 } });
    broken = false;
    const next = stateUpdate();
    expect(await outbox.enqueue(next, own)).toBe(2);
    const state = await inner.read();
    expect(state.entries.map((queued) => queued.message.id)).toEqual([first.id, next.id]);
    expect(state.lost).toEqual({ count: 1, byReason: { write_failed: 1 } });
  });

  it("merges a held loss into the next write of any kind", async () => {
    let broken = false;
    const { store, inner } = refusingStore(() => broken);
    const outbox = new ClientGatewayOutbox(store);
    broken = true;
    await outbox.enqueue(stateUpdate(), own);
    broken = false;
    await outbox.setLineage("lineage.1");
    expect((await inner.read()).lost).toEqual({ count: 1, byReason: { write_failed: 1 } });
  });

  it("keeps working on later operations after a refused write", async () => {
    let broken = true;
    const { store } = refusingStore(() => broken);
    const outbox = new ClientGatewayOutbox(store);
    await outbox.enqueue(stateUpdate(), own);
    broken = false;
    expect(await outbox.enqueue(stateUpdate(), own)).toBe(1);
    expect(store.attempts()).toBeGreaterThan(1);
  });
});
