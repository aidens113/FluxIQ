import assert from "node:assert/strict";
import { test } from "vitest";
import { createComposer } from "../composer.ts";
import { draftStorage } from "../draft-storage.ts";
import type { ChatOwner } from "../../owner-context.ts";
import type { ConversationState } from "../controller.ts";
import { messageTransport } from "../../tests/message-transport.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
const ready: ConversationState = { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };
function owner(identity: string): ChatOwner {
  return { identity, token: {}, current: () => true, transport: messageTransport(async () => ({ ok: true, value: {} })) };
}
async function isolated(body: () => Promise<void>) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  try { await withFakeDocument(body); } finally { if (before) Object.defineProperty(globalThis, "localStorage", before); else Reflect.deleteProperty(globalThis, "localStorage"); }
}
test("different owner parks draft; edits and fill never adopt; explicit adoption enables current send", async () => isolated(async () => {
  const calls: string[] = [];
  const composer = createComposer(async (text) => {
    calls.push(text);
    return true;
  });
  composer.setOwner(owner("a"));
  composer.render(ready);
  composer.fill("original draft");
  const root = fake(composer.element), box = root.descendants().find((node) => node.id === "conversationInput")!, send = root.descendants().find((node) => node.id === "conversationSendButton")!;
  composer.setOwner(owner("b"));
  assert.equal(box.value, "original draft");
  assert.equal(send.disabled, true);
  box.value = "edited parked draft";
  box.dispatch("input");
  composer.fill("filled parked draft");
  send.dispatch("click");
  assert.deepEqual(calls, []);
  assert.equal(send.disabled, true);
  root.descendants().find((node) => node.textContent === "Use draft here")!.dispatch("click");
  assert.equal(send.disabled, false);
  send.dispatch("click");
  await Promise.resolve();
  assert.deepEqual(calls, ["filled parked draft"]);
  assert.equal(box.value, "");
}));
// The words leave the box at once (U5), so the old owner's late answer -- sent or failed -- must neither put them
// back into the new owner's box nor release the new owner's own send.
test("an old-owner send's late answer cannot refill the new owner's box or release its pending send", async () => isolated(async () => {
  const finishes: Array<(sent: boolean) => void> = [];
  const composer = createComposer(() => new Promise((resolve) => finishes.push(resolve)));
  const a = owner("a");
  composer.setOwner(a);
  composer.render(ready);
  composer.fill("same text");
  const root = fake(composer.element), box = root.descendants().find((node) => node.id === "conversationInput")!, send = root.descendants().find((node) => node.id === "conversationSendButton")!;
  send.dispatch("click");
  assert.equal(box.value, "");
  composer.setOwner(owner("b"));
  composer.render(ready);
  composer.fill("same text");
  send.dispatch("click");
  assert.equal(box.value, "");
  finishes[0]!(false);
  await Promise.resolve();
  assert.equal(box.value, "", "a's failed send does not refill b's box");
  assert.equal(draftStorage().readOwned().owner, "b");
  composer.fill("next words");
  assert.equal(send.disabled, true, "b's own send is still on its way");
  finishes[1]!(true);
  await Promise.resolve();
  assert.equal(box.value, "next words");
  assert.equal(send.disabled, false);
}));
test("a send empties the box and the kept draft at once; the new owner's own failed send restores into its own box", async () => isolated(async () => {
  const finishes: Array<(sent: boolean) => void> = [];
  const calls: string[] = [];
  const composer = createComposer((text) => {
    calls.push(text);
    return new Promise((resolve) => finishes.push(resolve));
  });
  const a = owner("a");
  composer.setOwner(a);
  composer.render(ready);
  composer.fill("same text");
  const root = fake(composer.element), box = root.descendants().find((node) => node.id === "conversationInput")!, send = root.descendants().find((node) => node.id === "conversationSendButton")!;
  send.dispatch("click");
  assert.equal(box.value, "");
  assert.deepEqual(draftStorage().readOwned(), { text: "", owner: "a" });
  composer.setOwner(owner("b"));
  composer.render(ready);
  assert.equal(root.byClass("composer-draft-review")[0]!.hidden, true);
  composer.fill("b words");
  send.dispatch("click");
  assert.equal(box.value, "");
  assert.deepEqual(calls, ["same text", "b words"]);
  finishes[0]!(false);
  await Promise.resolve();
  assert.equal(box.value, "");
  assert.equal(send.disabled, true, "b's send is still on its way");
  finishes[1]!(false);
  await Promise.resolve();
  assert.equal(box.value, "b words");
  assert.deepEqual(draftStorage().readOwned(), { text: "b words", owner: "b" });
}));
test("current matching owner restores without repeated review; legacy and foreign drafts require adoption", async () => isolated(async () => {
  draftStorage().writeOwned("restored text", "a");
  const first = createComposer(async () => true);
  first.setOwner(owner("a"));
  first.render(ready);
  assert.equal(fake(first.element).byClass("composer-draft-review")[0]!.hidden, true);
  const second = createComposer(async () => true);
  second.setOwner(owner("b"));
  second.render(ready);
  assert.equal(fake(second.element).byClass("composer-draft-review")[0]!.hidden, false);
  draftStorage().writeOwned("legacy text", null);
  const third = createComposer(async () => true);
  third.setOwner(owner("a"));
  third.render(ready);
  assert.equal(fake(third.element).byClass("composer-draft-review")[0]!.hidden, false);
}));
test("retired adoption/clear controls cannot transfer or erase a later owner's draft", async () => isolated(async () => {
  const composer = createComposer(async () => true);
  composer.setOwner(owner("a"));
  composer.render(ready);
  composer.fill("parked text");
  composer.setOwner(owner("b"));
  const root = fake(composer.element), oldAdopt = root.descendants().find((node) => node.textContent === "Use draft here")!, oldClear = root.descendants().find((node) => node.textContent === "Clear draft")!;
  composer.setOwner(owner("c"));
  oldAdopt.dispatch("click");
  oldClear.dispatch("click");
  assert.equal(root.byClass("composer-draft-review")[0]!.hidden, false);
  assert.equal(root.descendants().find((node) => node.id === "conversationInput")!.value, "parked text");
  root.descendants().find((node) => node.textContent === "Clear draft")!.dispatch("click");
  assert.deepEqual(draftStorage().readOwned(), { text: "", owner: "c" });
}));
test("return to current retained draft owner unparks without replacing newer held text", async () => isolated(async () => {
  const composer = createComposer(async () => false);
  composer.setOwner(owner("a"));
  composer.render(ready);
  composer.fill("a draft");
  composer.setOwner(owner("b"));
  composer.fill("newer parked edit");
  composer.setOwner(owner("a"));
  const root = fake(composer.element);
  assert.equal(root.byClass("composer-draft-review")[0]!.hidden, true);
  assert.equal(root.descendants().find((node) => node.id === "conversationInput")!.value, "newer parked edit");
}));
test("obsolete owner disables dispatch and late failure preserves newer draft", async () => isolated(async () => {
  let live = true;
  let calls = 0;
  let finish!: (sent: boolean) => void;
  const composer = createComposer(() => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  });
  composer.setOwner({ ...owner("a"), current: () => live });
  composer.render(ready);
  composer.fill("pending draft");
  const root = fake(composer.element), send = root.descendants().find((node) => node.id === "conversationSendButton")!;
  send.dispatch("click");
  live = false;
  composer.setOwner(owner("b"));
  composer.render(ready);
  composer.fill("newer parked draft");
  finish(false);
  await Promise.resolve();
  assert.equal(root.descendants().find((node) => node.id === "conversationInput")!.value, "newer parked draft");
  assert.equal(calls, 1);
}));
