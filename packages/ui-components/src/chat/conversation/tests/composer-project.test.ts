import assert from "node:assert/strict";
import { test } from "vitest";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";

test("a project error disables the composer; its loading, ready and empty do not", async () => {
  await withFakeDocument(async () => {
    const composer = createComposer(async () => true);
    const state: ConversationState = { mode: "empty", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };
    const box = fake(composer.element).descendants().find(node => node.id === "conversationInput")!;
    composer.render({ ...state, scopeState: "error", projectId: "new" });
    assert.equal(box.disabled, true);
    composer.render({ ...state, scopeState: "loading", projectId: "new" });
    assert.equal(box.disabled, false);
    composer.render({ ...state, scopeState: "ready", projectId: "new" });
    assert.equal(box.disabled, false);
    composer.render({ ...state, mode: "loading" });
    assert.equal(box.disabled, false);
  });
});
