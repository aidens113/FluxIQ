import { describe, expect, it, vi } from "vitest";
import { AutomationStudioModelAccessLedger, type AutomationStudioModelAccessLedgerEntry } from "../ledger.ts";

const key = { id: "k1", updatedAtMs: 10, lastRotatedAtMs: 5 };
const memory = (initial: unknown = []) => {
  const store = { value: initial, writes: 0 };
  const read = async () => store.value;
  const write = async (entries: AutomationStudioModelAccessLedgerEntry[]) => {
    store.value = JSON.parse(JSON.stringify(entries));
    store.writes += 1;
  };
  return { store, port: { read, write } };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the model-access ledger", () => {
  it("keys an outcome by the value version: a rename keeps it and a replace clears it", () => {
    const ledger = new AutomationStudioModelAccessLedger(() => 7);
    ledger.note(key, "provider_refused", "refused");
    expect(ledger.lastCall({ ...key, updatedAtMs: 99 })).toEqual({ outcome: "provider_refused", atMs: 7 });
    expect(ledger.lastMessage({ ...key, updatedAtMs: 99 })).toBe("refused");
    expect(ledger.lastCall({ ...key, lastRotatedAtMs: 6 })).toBeNull();
    // Without a rotation time the change time is the version.
    ledger.note({ id: "k2", updatedAtMs: 3 }, "no_credit");
    expect(ledger.lastCall({ id: "k2", updatedAtMs: 4 })).toBeNull();
  });

  it("fires subscribers once per change of outcome or version, never for a repeat, and stops after unsubscribe", () => {
    const ledger = new AutomationStudioModelAccessLedger();
    const listener = vi.fn();
    const stop = ledger.subscribe(listener);
    ledger.note(key, "answered");
    ledger.note(key, "answered");
    expect(listener).toHaveBeenCalledTimes(1);
    ledger.note(key, "provider_refused");
    expect(listener).toHaveBeenCalledTimes(2);
    ledger.note({ ...key, lastRotatedAtMs: 6 }, "provider_refused");
    expect(listener).toHaveBeenCalledTimes(3);
    ledger.noteCheck({ ...key, lastRotatedAtMs: 6 }, { outcome: "no_credit" });
    expect(listener).toHaveBeenCalledTimes(4);
    stop();
    ledger.note(key, "answered");
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("persists only on a change and a new instance reads the refusal back", async () => {
    const { store, port } = memory();
    const first = new AutomationStudioModelAccessLedger(() => 50, port);
    await first.whenLoaded();
    first.note(key, "provider_refused", "refused");
    first.note(key, "provider_refused", "refused");
    await flush();
    expect(store.writes).toBe(1);
    const second = new AutomationStudioModelAccessLedger(() => 99, port);
    await second.whenLoaded();
    expect(second.lastCall(key)).toEqual({ outcome: "provider_refused", atMs: 50 });
    expect(second.lastMessage(key)).toBe("refused");
    expect(second.lastCall({ ...key, lastRotatedAtMs: 6 })).toBeNull();
    expect(store.writes).toBe(1);
  });

  it("reads its store only once model access is asked or an outcome is noted, never as it is made", async () => {
    const { port } = memory([{ keyId: "k1", version: 5, outcome: "no_credit", atMs: 3 }]);
    const read = vi.fn(port.read);
    const asked = new AutomationStudioModelAccessLedger(() => 1, { read, write: port.write });
    await flush();
    expect(read).not.toHaveBeenCalled();
    await asked.whenLoaded();
    await asked.whenLoaded();
    expect(read).toHaveBeenCalledTimes(1);
    expect(asked.lastCall(key)).toEqual({ outcome: "no_credit", atMs: 3 });

    // A noted outcome reads the store first, keeps the newer outcome over the stored one and writes both back.
    const { store, port: other } = memory([{ keyId: "k1", version: 5, outcome: "no_credit", atMs: 3 }, { keyId: "k9", version: 1, outcome: "answered", atMs: 2 }]);
    const noted = new AutomationStudioModelAccessLedger(() => 8, other);
    noted.note(key, "answered");
    await noted.whenLoaded();
    await flush();
    expect(noted.lastCall(key)).toEqual({ outcome: "answered", atMs: 8 });
    expect((store.value as AutomationStudioModelAccessLedgerEntry[]).map((entry) => [entry.keyId, entry.outcome])).toEqual([["k1", "answered"], ["k9", "answered"]]);
  });

  it("starts no read or write once closed, and its close settles only when the work already running has", async () => {
    let releaseWrite!: () => void;
    const write = vi.fn(() => new Promise<void>((resolve) => { releaseWrite = resolve; }));
    const running = new AutomationStudioModelAccessLedger(() => 4, { read: async () => [], write });
    await running.whenLoaded();
    running.note(key, "provider_refused");
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    let closed = false;
    const closing = running.close().then(() => { closed = true; });
    running.note({ id: "k2", updatedAtMs: 1 }, "no_credit");
    await flush();
    expect(closed).toBe(false);
    releaseWrite();
    await closing;
    expect(closed).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    // The outcomes still read in memory; only the store is left alone.
    expect(running.lastCall({ id: "k2", updatedAtMs: 1 })).toEqual({ outcome: "no_credit", atMs: 4 });

    // A write waiting on a read still running is dropped when the ledger closes, and the close waits for the read.
    let releaseRead!: (value: unknown) => void;
    const laterWrite = vi.fn(async () => undefined);
    const reading = new AutomationStudioModelAccessLedger(() => 5, { read: () => new Promise((resolve) => { releaseRead = resolve; }), write: laterWrite });
    reading.note(key, "answered");
    let readingClosed = false;
    const readingClose = reading.close().then(() => { readingClosed = true; });
    await flush();
    expect(readingClosed).toBe(false);
    releaseRead([]);
    await readingClose;
    expect(laterWrite).not.toHaveBeenCalled();

    // Closed before anything was asked, it never opens its store at all.
    const idleRead = vi.fn(async () => []);
    const idle = new AutomationStudioModelAccessLedger(() => 6, { read: idleRead, write: laterWrite });
    await idle.close();
    await idle.whenLoaded();
    idle.note(key, "answered");
    await flush();
    expect(idleRead).not.toHaveBeenCalled();
    expect(laterWrite).not.toHaveBeenCalled();
  });

  it("starts empty from an unreadable or malformed store and keeps working when a write fails", async () => {
    const broken = new AutomationStudioModelAccessLedger(() => 1, { read: async () => { throw new Error("disk"); }, write: async () => { throw new Error("disk"); } });
    await broken.whenLoaded();
    expect(broken.note(key, "answered")).toEqual({ outcome: "answered", atMs: 1 });
    await flush();
    const junk = new AutomationStudioModelAccessLedger(undefined, memory([{ keyId: 1 }, null, { keyId: "k", version: 1, outcome: "weird", atMs: 1 }]).port);
    await junk.whenLoaded();
    expect(junk.lastCall({ id: "k", updatedAtMs: 1 })).toBeNull();
  });
});
