// The task's humanness on its answer card (`view/humanness-section.ts`): absent without
// the task settings port; with it, "Humanness · N" folded under the card, read for the
// card's own task and again on opening, set through the port, kept across the card's
// redraws, hidden where the client cannot carry it, and a failed read said inside.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, fakeTaskOutcomes, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import type { ChatResult, ChatSetHumannessRequest, ChatTaskRef, ChatTaskSettings, ChatTaskSettingsPort } from "../../ports/index.ts";
import { createAnswerView, type AnswerHost } from "../index.ts";

const NOW = 1_800_000_000_000 + 86_400_000 + 60_000;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const one = (root: FakeElement, className: string): FakeElement => root.byClass(className)[0]!;

/** A port that answers `read` from `answer` and records every request. */
function port(answer: () => ChatResult<ChatTaskSettings>) {
  const reads: ChatTaskRef[] = [];
  const sets: ChatSetHumannessRequest[] = [];
  const settings: ChatTaskSettingsPort = {
    read: async (task) => {
      reads.push(task);
      return answer();
    },
    setHumanness: async (request) => {
      sets.push(request);
      return { ok: true, value: request.humanness === null ? {} : { humanness: request.humanness } };
    }
  };
  return { reads, sets, settings };
}

function draw(host: AnswerHost) {
  const view = createAnswerView({ now: () => NOW, ...host });
  assert.equal(view.update(fakeTaskOutcomes().rowsChecked), true);
  return { view, root: fake(view.element) };
}

test("without the task settings port the card has no humanness control", async () => {
  await withFakeDocument(() => {
    const { root } = draw({});
    assert.equal(root.byClass("answer-humanness").length, 0);
    assert.equal(root.byClass("humanness").length, 0);
  });
});

test("with the port: Humanness · N under the card, read for its task, opened onto the slider, set through the port", async () => {
  await withFakeDocument(async () => {
    const { reads, sets, settings } = port(() => ({ ok: true, value: { starting: 40 } }));
    const { root } = draw({ taskSettings: settings });
    const section = one(root, "answer-humanness");
    assert.equal(section.hidden, true, "nothing shows before the read lands");
    await settle();
    assert.deepEqual(reads, [{ projectId: "project-1", taskId: "task-deals" }]);
    assert.equal(section.hidden, false);
    const toggle = one(root, "answer-humanness-toggle");
    assert.equal(toggle.textContent, "Humanness · 40");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    const panel = one(root, "answer-humanness-panel");
    assert.equal(panel.hidden, true, "folded, so the card stays calm");
    assert.equal(toggle.getAttribute("aria-controls"), panel.id);
    assert.equal(one(root, "answer-card").lastElementChild, section, "last on the card");
    toggle.dispatch("click");
    assert.equal(panel.hidden, false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    await settle();
    assert.equal(reads.length, 2, "opening reads again");
    assert.match(one(root, "humanness-inherited").textContent, /Uses your starting value \(40\)/u);
    const range = one(root, "humanness-range");
    range.value = "65";
    range.dispatch("change");
    await settle();
    assert.deepEqual(sets, [{ projectId: "project-1", taskId: "task-deals", humanness: 65 }]);
    assert.equal(toggle.textContent, "Humanness · 65");
    one(root, "humanness-clear").dispatch("click");
    await settle();
    assert.deepEqual(sets[1], { projectId: "project-1", taskId: "task-deals", humanness: null });
    assert.equal(toggle.textContent, "Humanness · 40");
  });
});

test("the card's redraw keeps the section, its slider and its state", async () => {
  await withFakeDocument(async () => {
    const { settings } = port(() => ({ ok: true, value: { humanness: 20, starting: 40 } }));
    const { view, root } = draw({ taskSettings: settings });
    await settle();
    const section = one(root, "answer-humanness");
    const range = one(root, "humanness-range");
    assert.equal(range.value, "20");
    one(root, "answer-humanness-toggle").dispatch("click");
    const outcome = fakeTaskOutcomes().rowsChecked;
    outcome.result!.label = "refuted";
    view.update(outcome);
    assert.deepEqual(root.byClass("answer-check-words").map((element) => element.textContent), ["Did not pass the check"]);
    assert.equal(one(root, "answer-humanness"), section);
    assert.equal(one(root, "humanness-range"), range);
    assert.equal(one(root, "answer-humanness-panel").hidden, false, "still open");
    assert.equal(one(root, "answer-card").lastElementChild, section);
    assert.equal(root.byClass("answer-humanness").length, 1);
  });
});

test("a client that cannot carry the read shows nothing; a read that failed says why inside", async () => {
  await withFakeDocument(async () => {
    const unsupported = draw({ taskSettings: port(() => ({ ok: false, sentence: "Not here.", unsupported: true })).settings }).root;
    await settle();
    assert.equal(one(unsupported, "answer-humanness").hidden, true);
    const failed = draw({ taskSettings: port(() => ({ ok: false, sentence: "FluxIQ is not reachable." })).settings }).root;
    await settle();
    assert.equal(one(failed, "answer-humanness").hidden, false);
    assert.equal(one(failed, "answer-humanness-toggle").textContent, "Humanness");
    assert.equal(one(failed, "answer-humanness-problem").textContent, "I could not read this task's humanness. FluxIQ is not reachable.");
    assert.equal(failed.byClass("humanness").length, 0);
  });
});
