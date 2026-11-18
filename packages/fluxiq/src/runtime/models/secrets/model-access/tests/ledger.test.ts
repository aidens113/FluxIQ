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
