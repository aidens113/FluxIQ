// The key bar above the composer: hidden on an empty chat and while the key is ready, the card's own words
// otherwise, and the key read again after each new reply or failed send, never on unchanged turns.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { modelAccessWords, type ModelAccessState, type ModelKeysPort } from "../../../model-access/index.ts";
import type { CoreTurn } from "../../conversation/index.ts";
import { createComposerKeyBar } from "../composer-key-bar.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const turn = (turnId: string, author: string, extra: Partial<CoreTurn> = {}): CoreTurn => ({ turnId, author, text: turnId, ask: null, ...extra });
const NOT_ACCEPTED: ModelAccessState = { kind: "not-accepted", provider: "Anthropic", keyName: "Work key" };

function port(states: ModelAccessState[]) {
  let reads = 0;
  const value: ModelKeysPort = {
    readState: async () => ({ ok: true, state: states[Math.min(reads++, states.length - 1)]! }),
    save: async () => ({ ok: true }),
    replace: async () => ({ ok: true }),
    remove: async () => ({ ok: true }),
    requiresPassword: false,
    canWrite: true
  };
  return { value, reads: () => reads };
}

test("an empty chat shows no bar; a chat with turns and a key that is not ready shows the card's words", async () => {
  await withFakeDocument(async () => {
    const keys = port([NOT_ACCEPTED]);
    const bar = createComposerKeyBar(keys.value, () => undefined);
    bar.update([]);
    await settle();
    assert.equal(bar.element.hidden, true);
    bar.update([turn("p1", "person"), turn("a1", "automation")]);
    await settle();
    assert.equal(bar.element.hidden, false);
    assert.ok(fake(bar.element).textContent.includes(modelAccessWords(NOT_ACCEPTED).sentence));
  });
});

test("a ready key adds nothing above the composer", async () => {
  await withFakeDocument(async () => {
    const bar = createComposerKeyBar(port([{ kind: "ready", provider: "Anthropic", keyName: "Work key" }]).value, () => undefined);
    bar.update([turn("p1", "person"), turn("a1", "automation")]);
    await settle();
    assert.equal(bar.element.hidden, true);
  });
});

test("the key is read again after a new reply and after a failed send, not on the same turns", async () => {
  await withFakeDocument(async () => {
    const keys = port([{ kind: "ready", provider: "Anthropic", keyName: "Work key" }, NOT_ACCEPTED]);
    const bar = createComposerKeyBar(keys.value, () => undefined);
    await settle();
    const opening = keys.reads();
    bar.update([turn("p1", "person"), turn("a1", "automation")]);
    await settle();
    assert.equal(keys.reads(), opening + 1, "the chat's turns on screen are read once");
    bar.update([turn("p1", "person"), turn("a1", "automation")]);
    await settle();
    assert.equal(keys.reads(), opening + 1, "unchanged turns read nothing");
    bar.update([turn("p1", "person"), turn("a1", "automation"), turn("p2", "person"), turn("a2", "automation")]);
    await settle();
    assert.equal(keys.reads(), opening + 2, "a new reply reads the key again");
    assert.equal(bar.element.hidden, false, "and the key that stopped working is shown");
    bar.update([turn("p1", "person"), turn("a1", "automation"), turn("p2", "person"), turn("a2", "automation"), turn("p3", "person", { sendError: "Not sent." })]);
    await settle();
    assert.equal(keys.reads(), opening + 3, "a failed send reads the key again");
  });
});

test("a pushed key state shows or hides the bar at once, with no read", async () => {
  await withFakeDocument(async () => {
    const keys = port([{ kind: "ready", provider: "Anthropic", keyName: "Work key" }]);
    let push: ((state: ModelAccessState | null) => void) | undefined;
    const bar = createComposerKeyBar({ ...keys.value, subscribe: (listener) => ((push = listener), () => undefined) }, () => undefined);
    bar.update([]);
    await settle();
    bar.update([turn("p1", "person"), turn("a1", "automation")]);
    await settle();
    const reads = keys.reads();
    assert.equal(bar.element.hidden, true);
    const empty: ModelAccessState = { kind: "no-credit", provider: "Anthropic", keyName: "Work key" };
    push!(empty);
    assert.equal(bar.element.hidden, false);
    assert.ok(fake(bar.element).textContent.includes(modelAccessWords(empty).sentence));
    push!({ kind: "ready", provider: "Anthropic", keyName: "Work key" });
    assert.equal(bar.element.hidden, true);
    assert.equal(keys.reads(), reads, "no read followed a push");
  });
});
