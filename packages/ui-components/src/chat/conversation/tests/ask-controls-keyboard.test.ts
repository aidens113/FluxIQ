import assert from "node:assert/strict";
import { test } from "vitest";
import { askControls } from "../ask-controls.ts";
import type { CoreAsk } from "../core-thread.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";

const pending: CoreAsk = { askId: "synthetic-ask", kind: "open", status: "pending", options: null, answer: null };
function controls(ask: CoreAsk = pending, answering = false, error: string | undefined = undefined) {
  const answers: Array<{ kind: string; value: string | undefined }> = [];
  const element = fake(askControls(ask, {
    answering, error, answer: (kind, value) => answers.push({ kind, value }),
    openFluxIQ: () => document.createElement("button")
  }));
  return { element, answers, input: element.byClass("turn-answer")[0], button: element.byClass("small-button")[0] };
}
for (const [name, flags] of [
  ["legacy IME229", { keyCode: 229, isComposing: false }],
  ["composing", { isComposing: true }],
  ["already handled", { defaultPrevented: true }],
  ["Alt", { altKey: true }], ["Control", { ctrlKey: true }],
  ["Meta", { metaKey: true }], ["Shift", { shiftKey: true }]
] as const) {
  test(`${name} Enter stays unconsumed and never attempts an answer`, async () => withFakeDocument(() => {
    const view = controls();
    view.input!.value = " synthetic words ";
    view.input!.dispatch("keydown", { key: "Enter", ...flags, preventDefault: () => assert.fail("must remain native") });
    assert.deepEqual(view.answers, []);
  }));
}
test("plain Enter submits trimmed text from its own input while leaving native default alone", async () => withFakeDocument(() => {
  const view = controls();
  view.input!.value = " synthetic words ";
  const other = controls();
  other.input!.value = "other words";
  view.input!.dispatch("keydown", { key: "Enter", isComposing: false, keyCode: 13, preventDefault: () => assert.fail("must preserve existing native default") });
  assert.deepEqual(view.answers, [{ kind: "text", value: "synthetic words" }]);
  assert.deepEqual(other.answers, []);
}));
test("blank Enter and other editing/navigation keys never attempt an answer", async () => withFakeDocument(() => {
  const view = controls();
  view.input!.value = "  ";
  view.input!.dispatch("keydown", { key: "Enter" });
  view.input!.value = "synthetic";
  for (const key of [" ", "ArrowLeft", "ArrowRight", "Home", "End", "Escape", "a"]) view.input!.dispatch("keydown", { key });
  assert.deepEqual(view.answers, []);
}));
test("explicit Answer remains native and trims current text", async () => withFakeDocument(() => {
  const view = controls();
  assert.equal(view.input!.getAttribute("aria-label"), "Your answer");
  assert.equal(view.input!.getAttribute("type"), "text");
  assert.equal(view.button!.getAttribute("type"), "button");
  view.input!.value = " by click ";
  view.button!.dispatch("click");
  assert.deepEqual(view.answers, [{ kind: "text", value: "by click" }]);
}));
test("busy native controls and nearby recoverable error retain their existing presentation", async () => withFakeDocument(() => {
  const view = controls(pending, true, "Synthetic retry message");
  assert.equal(view.input!.disabled, true);
  assert.equal(view.button!.disabled, true);
  const error = view.element.byClass("notice")[0]!;
  assert.equal(error.getAttribute("role"), "status");
  assert.equal(error.textContent, "Synthetic retry message");
  // Fake dispatch bypasses native disabled behavior; no callback ownership assertion is inferred here.
}));
test("settled/expired/unsupported asks expose no editable input or Answer action", async () => withFakeDocument(() => {
  for (const ask of [{ ...pending, status: "answered" }, { ...pending, status: "expired" }, { ...pending, kind: "unknown" }]) {
    const view = controls(ask);
    assert.equal(view.input, undefined);
    assert.equal(view.button, undefined);
    assert.notEqual(view.element.textContent, "");
    assert.deepEqual(view.answers, []);
  }
}));
test("choice click preserves displayed choice kind/value and busy native state", async () => withFakeDocument(() => {
  const ask: CoreAsk = { ...pending, kind: "choice", options: [{ id: "synthetic-choice", label: "Choose synthetic" }] };
  const view = controls(ask);
  view.button!.dispatch("click");
  assert.deepEqual(view.answers, [{ kind: "choice", value: "synthetic-choice" }]);
  assert.equal(view.input, undefined);
  assert.equal(controls(ask, true).button!.disabled, true);
}));
// Answers require a person's activation: a choice or the Answer box acts on a person's trusted press or key only.
test("a choice ignores an untrusted click and answers a trusted press", async () => withFakeDocument(() => {
  const ask: CoreAsk = { ...pending, kind: "choice", options: [{ id: "synthetic-choice", label: "Choose synthetic" }] };
  const view = controls(ask);
  view.button!.click();
  view.button!.dispatchUntrusted("click");
  view.button!.dispatch("click", { isTrusted: false });
  assert.deepEqual(view.answers, []);
  view.button!.dispatch("click");
  assert.deepEqual(view.answers, [{ kind: "choice", value: "synthetic-choice" }]);
}));
test("the Answer box ignores an untrusted click and Enter, and answers trusted ones", async () => withFakeDocument(() => {
  const view = controls();
  view.input!.value = "synthetic words";
  view.button!.click();
  view.input!.dispatchUntrusted("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  assert.deepEqual(view.answers, []);
  view.button!.dispatch("click");
  view.input!.dispatch("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  assert.deepEqual(view.answers, [{ kind: "text", value: "synthetic words" }, { kind: "text", value: "synthetic words" }]);
}));
