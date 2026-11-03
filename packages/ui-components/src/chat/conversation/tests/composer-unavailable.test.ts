import assert from "node:assert/strict";
import { test } from "vitest";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";

const READY: ConversationState = { mode: "empty", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };

test("with nowhere to send the box is disabled and the reason stands above it, until it is lifted", async () => {
  await withFakeDocument(() => {
    const composer = createComposer(async () => true);
    const root = fake(composer.element);
    const box = root.descendants().find((node) => node.id === "conversationInput")!;
    const reason = root.byClass("composer-unavailable")[0]!;
    composer.render(READY);
    assert.equal(box.disabled, false);
    assert.equal(reason.hidden, true);
    composer.setUnavailable("Open a project to start a conversation.");
    composer.render(READY);
    assert.equal(box.disabled, true);
    assert.equal(box.placeholder, "Chat unavailable");
    assert.equal(reason.hidden, false);
    assert.equal(reason.textContent, "Open a project to start a conversation.");
    assert.equal(root.byClass("composer-send")[0]!.disabled, true);
    composer.setUnavailable(undefined);
    composer.render(READY);
    assert.equal(box.disabled, false);
    assert.equal(box.placeholder, "Message FluxIQ");
    assert.equal(reason.hidden, true);
  });
});
