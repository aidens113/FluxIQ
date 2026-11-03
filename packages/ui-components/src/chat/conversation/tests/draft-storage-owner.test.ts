import assert from "node:assert/strict";
import { test } from "vitest";
import { draftStorage } from "../draft-storage.ts";
const legacy = "fluxiq.ui.conversationDraft", owned = "fluxiq.ui.conversationDraft.v1";
function storage(body: (values: Map<string, string>, fake: Storage) => void) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const fake = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } as unknown as Storage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: fake });
  try { body(values, fake); } finally { if (before) Object.defineProperty(globalThis, "localStorage", before); else Reflect.deleteProperty(globalThis, "localStorage"); }
}
test("legacy JSON-looking text remains literal unowned draft", () => storage((values) => {
  const text = '{"version":1,"text":"not metadata","owner":"a"}';
  values.set(legacy, text);
  assert.deepEqual(draftStorage().readOwned(), { text, owner: null });
}));
test("owned record round trips atomically without changing standalone APIs", () => storage((values) => {
  const draft = draftStorage();
  draft.write("legacy");
  assert.equal(draft.read(), "legacy");
  draft.writeOwned("owned words", "a");
  assert.deepEqual(draft.readOwned(), { text: "owned words", owner: "a" });
  assert.equal(values.has(legacy), false);
}));
for (const record of [{ version: 2, text: "recoverable", owner: "a" }, { version: 1, text: "recoverable", owner: 5 }]) test("malformed owned metadata preserves recoverable text without adoption", () => storage((values) => {
  values.set(owned, JSON.stringify(record));
  assert.deepEqual(draftStorage().readOwned(), { text: "recoverable", owner: null });
}));
test("invalid JSON prefers literal legacy text", () => storage((values) => {
  values.set(owned, "broken{");
  values.set(legacy, "original text");
  assert.deepEqual(draftStorage().readOwned(), { text: "original text", owner: null });
}));
test("new record write failure cannot owner-stamp old legacy text", () => storage((values, fake) => {
  values.set(legacy, "legacy text");
  fake.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
  draftStorage().writeOwned("new text", "a");
  assert.deepEqual(draftStorage().readOwned(), { text: "legacy text", owner: null });
}));
test("successful empty record prevents legacy resurrection when removal is blocked", () => storage((values, fake) => {
  values.set(legacy, "legacy text");
  fake.removeItem = () => { throw new DOMException("blocked", "SecurityError"); };
  draftStorage().writeOwned("", "a");
  assert.deepEqual(draftStorage().readOwned(), { text: "", owner: "a" });
  assert.equal(values.get(legacy), "legacy text");
}));
test("blocked reads cost only draft convenience; unexpected exceptions retain legacy behavior", () => storage((_, fake) => {
  fake.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
  assert.deepEqual(draftStorage().readOwned(), { text: "", owner: null });
  fake.getItem = () => { throw new Error("unexpected"); };
  assert.throws(() => draftStorage().readOwned(), /unexpected/);
}));
