// A question in a host's words: a title only when it has one, Enter sends an open
// question's words as in the composer, and an action needing a dialog the host does
// not have gives way to the sentence and the Open FluxIQ control.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import type { ChatAskPresentation } from "../../ports/index.ts";
import { presentedAskControls } from "../presented-ask.ts";

const presentation = (overrides: Partial<ChatAskPresentation> = {}): ChatAskPresentation => ({
  title: "", description: "", consequences: [], actions: [], takesText: false, ...overrides
});

function drawn(presented: ChatAskPresentation, reauthorize?: (action: { label: string }) => void) {
  const answers: Array<[string, string | undefined]> = [];
  const parts = presentedAskControls(presented, {
    answering: false, error: undefined,
    answer: (kind, value) => {
      answers.push([kind, value]);
      return { ok: true };
    },
    openFluxIQ: () => {
      const opener = document.createElement("a");
      opener.className = "opener";
      return opener;
    },
    ...(reauthorize === undefined ? {} : { reauthorize })
  });
  const root = fake(document.createElement("div"));
  for (const part of parts) root.append(fake(part));
  return { root, answers };
}

test("no title draws no empty line, and a title draws", async () => withFakeDocument(() => {
  assert.equal(drawn(presentation()).root.byClass("turn-ask-title").length, 0);
  assert.equal(drawn(presentation({ title: "Allow this?" })).root.byClass("turn-ask-title")[0]?.textContent, "Allow this?");
}));

test("Enter sends an open question's words, Shift+Enter leaves a new line, and composing sends nothing", async () => withFakeDocument(async () => {
  const { root, answers } = drawn(presentation({ takesText: true }));
  const box = root.byClass("turn-answer-text")[0]!;
  box.value = " the blue one ";
  box.dispatch("input");
  const prevented: string[] = [];
  const key = (fields: Record<string, unknown>) => box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => prevented.push("x"), ...fields });
  key({ shiftKey: true });
  key({ isComposing: true });
  key({ keyCode: 229 });
  key({ ctrlKey: true });
  assert.deepEqual(answers, []);
  assert.deepEqual(prevented, []);
  key({});
  assert.deepEqual(answers, [["text", "the blue one"]]);
  assert.equal(prevented.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(box.value, "", "the words are gone once they went");
  key({});
  assert.equal(answers.length, 1, "an empty box sends nothing");
}));

const pinAsk = presentation({
  note: "This panel can't take your PIN.",
  actions: [
    { id: "grant", label: "Confirm", tone: "danger", kind: "grant", reauthorize: { title: "t", description: "d", actionLabel: "Confirm" } },
    { id: "deny", label: "Cancel", tone: "secondary", kind: "deny" }
  ]
});

test("with no dialog the action that needs one gives way to where to answer, and Cancel stays and answers", async () => withFakeDocument(() => {
  const { root, answers } = drawn(pinAsk);
  const buttons = root.querySelectorAll("button");
  assert.deepEqual(buttons.map((button) => button.textContent), ["Cancel"]);
  assert.match(root.textContent, /Answer this in FluxIQ\./u);
  assert.equal(root.byClass("opener").length, 1);
  buttons[0]!.dispatch("click");
  assert.deepEqual(answers, [["deny", undefined]]);
}));

test("with a dialog the press asks for it and answers nothing yet", async () => withFakeDocument(() => {
  const pressed: string[] = [];
  const { root, answers } = drawn(pinAsk, (action) => pressed.push(action.label));
  assert.equal(root.byClass("opener").length, 0);
  root.querySelectorAll("button")[0]!.dispatch("click");
  assert.deepEqual(pressed, ["Confirm"]);
  assert.deepEqual(answers, []);
}));

// Answers require a person's activation: an action or Send answer acts on a person's trusted press or key only.
test("an action ignores an untrusted click, and a trusted press answers or asks for the dialog", async () => withFakeDocument(() => {
  const pressed: string[] = [];
  const { root, answers } = drawn({ ...pinAsk, actions: [{ id: "allow", label: "Allow", tone: "primary", kind: "grant" }, ...pinAsk.actions] }, (action) => pressed.push(action.label));
  const button = (label: string) => root.querySelectorAll("button").find((candidate) => candidate.textContent === label)!;
  button("Allow").click();
  button("Confirm").dispatchUntrusted("click");
  button("Cancel").dispatch("click", { isTrusted: false });
  assert.deepEqual(answers, []);
  assert.deepEqual(pressed, []);
  button("Allow").dispatch("click");
  button("Confirm").dispatch("click");
  assert.deepEqual(answers, [["grant", undefined]]);
  assert.deepEqual(pressed, ["Confirm"]);
}));

test("an open question ignores an untrusted Send answer and Enter, and sends on a trusted press", async () => withFakeDocument(() => {
  const { root, answers } = drawn(presentation({ takesText: true }));
  const box = root.byClass("turn-answer-text")[0]!;
  box.value = "the blue one";
  box.dispatch("input");
  const send = root.querySelectorAll("button").find((candidate) => candidate.textContent === "Send answer")!;
  send.click();
  box.dispatchUntrusted("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
  assert.deepEqual(answers, []);
  send.dispatch("click");
  assert.deepEqual(answers, [["text", "the blue one"]]);
}));
