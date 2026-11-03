// The chat's read notice under a fake DOM: hidden while reads succeed or fail
// only for a moment, the sentence naming what failed once it lasts, and a
// Retry that reads again and says so while it does.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../../testing/index.ts";
import type { ConversationState } from "../../controller.ts";
import { createReadNotice } from "../notice.ts";

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map(), ...overrides };
}

const NOTICE = "This chat isn't updating: finding this chat in FluxIQ failed (FluxIQ answered 200).";

test("no notice until reading has kept failing; then the sentence and a Retry that reads again", async () => {
  await withFakeDocument(() => {
    let retries = 0;
    const notice = createReadNotice(() => (retries += 1));
    const element = fake(notice.element);
    notice.render(state());
    assert.equal(element.hidden, true);
    assert.equal(element.getAttribute("role"), "status");

    notice.render(state({ readError: NOTICE }));
    assert.equal(element.hidden, false);
    const [text, button] = element.children;
    assert.equal(text?.textContent, NOTICE);
    assert.equal(button?.textContent, "Retry");
    assert.equal(button?.disabled, false);
    button?.dispatch("click");
    assert.equal(retries, 1);

    notice.render(state({ readError: NOTICE, reading: true }));
    assert.equal(button?.textContent, "Retrying...");
    assert.equal(button?.disabled, true);

    notice.render(state());
    assert.equal(element.hidden, true, "a good read hides it");
  });
});
