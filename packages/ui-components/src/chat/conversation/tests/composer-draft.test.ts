import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";

const ready: ConversationState = { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };

for (const scenario of ["unchanged", "edited", "retyped", "filled", "failed", "composition"] as const) {
  test(`composer pending send preserves the correct draft: ${scenario}`, async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    } });
    try {
      await withFakeDocument(async () => {
        let finish!: (sent: boolean) => void;
        const calls: string[] = [];
        const composer = createComposer((text) => {
          calls.push(text);
          return new Promise((resolve) => { finish = resolve; });
        });
        composer.render(ready);
        const root = fake(composer.element);
        const box = root.descendants().find((node) => node.id === "conversationInput")!;
        const send = root.descendants().find((node) => node.id === "conversationSendButton")!;
        composer.fill("submitted");
        if (scenario === "composition") {
          box.dispatch("compositionstart");
          box.dispatch("keydown", { key: "Enter", preventDefault: () => assert.fail("IME Enter must not submit") });
          assert.equal(calls.length, 0);
          box.dispatch("compositionend");
        }
        send.dispatch("click");
        composer.render({ ...ready, sending: true });
        assert.equal(box.disabled, false);
        assert.equal(box.value, "", "the box empties the moment the message is sent, as a chat does");
        assert.equal(values.get("fluxiq.ui.conversationDraft") ?? "", "", "the sent words are no longer the kept draft");
        if (scenario === "edited" || scenario === "composition") {
          box.value = "newer words";
          box.dispatch("input");
        }
        if (scenario === "retyped") {
          box.value = "changed";
          box.dispatch("input");
          box.value = "submitted";
          box.dispatch("input");
        }
        if (scenario === "filled") composer.fill("example for later");
        finish(scenario !== "failed");
        await Promise.resolve();
        composer.render({ ...ready, ...(scenario === "failed" ? { sendError: "Try again" } : {}) });
        const expected = scenario === "unchanged" ? "" : scenario === "edited" || scenario === "composition" ? "newer words" : scenario === "filled" ? "example for later" : "submitted";
        assert.equal(box.value, expected);
        assert.equal(values.get("fluxiq.ui.conversationDraft") ?? "", expected);
        assert.deepEqual(calls, ["submitted"], "typing/fill/composition never sends automatically");
        assert.equal(send.disabled, expected === "");
        // The failure is said on the person's turn in the stream (U5), not a second time here.
        if (scenario === "failed") assert.equal(root.descendants().filter((node) => node.textContent === "Try again").length, 0);
      });
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
}

// D10 of the t174 UI review (run-musp8nz1-dbd3905a): A9 put failed words back
// ahead of newer typing. One rule instead (t265 decision 1): the failed words
// come back only to an untouched box, so two messages never merge into one
// draft; the failed message stays in the thread, saying why, to copy from.
test("a send that fails keeps what was typed meanwhile, and never merges the two", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } });
  try {
    await withFakeDocument(async () => {
      let finish!: (sent: boolean) => void;
      const composer = createComposer(() => new Promise((resolve) => { finish = resolve; }));
      composer.render(ready);
      const root = fake(composer.element);
      const box = root.descendants().find((node) => node.id === "conversationInput")!;
      composer.fill("submitted");
      root.descendants().find((node) => node.id === "conversationSendButton")!.dispatch("click");
      assert.equal(box.value, "");
      box.value = "and more";
      box.dispatch("input");
      finish(false);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(box.value, "and more", "the newer words stay as typed");
      assert.equal(values.get("fluxiq.ui.conversationDraft"), "and more");
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
