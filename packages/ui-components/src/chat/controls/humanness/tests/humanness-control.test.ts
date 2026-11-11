// The humanness control (`humanness-control.ts`): the inherited state says the starting
// value, a drag is sent once on release, the keys step by 5 and are sent once they rest,
// "Use starting value" sends null, a refusal says the host's words and goes back, and
// only the latest of several changes goes while one is on its way.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument, type FakeElement } from "../../../../testing/index.ts";
import type { ChatResult } from "../../../ports/index.ts";
import { createHumannessControl, humannessWords, type HumannessLevel } from "../index.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const one = (root: FakeElement, className: string): FakeElement => root.byClass(className)[0]!;
const key = (range: FakeElement, name: string) => {
  let prevented = false;
  range.dispatch("keydown", { key: name, preventDefault: () => (prevented = true) });
  return prevented;
};

/** A commit that records what it was asked and answers `reply` (the saved level by default). */
function recording(reply?: (humanness: number | null) => Promise<ChatResult<{ humanness?: number }>>) {
  const sent: Array<number | null> = [];
  const commit = async (humanness: number | null): Promise<ChatResult<{ humanness?: number }>> => {
    sent.push(humanness);
    if (reply !== undefined) return await reply(humanness);
    return { ok: true, value: humanness === null ? {} : { humanness } };
  };
  return { sent, commit };
}

function mount(level: HumannessLevel, commit: ReturnType<typeof recording>["commit"], heard: HumannessLevel[] = []) {
  const control = createHumannessControl({ level, commit, settleMs: 0, onLevel: (saved) => heard.push(saved) });
  const root = fake(control.element);
  return { control, root, range: one(root, "humanness-range"), clear: one(root, "humanness-clear"), status: one(root, "humanness-status") };
}

test("inherited shows the starting value; an own level shows itself with Use starting value", async () => {
  await withFakeDocument(() => {
    const { root, range, clear } = mount({ starting: 40 }, recording().commit);
    assert.equal(root.getAttribute("data-state"), "inherited");
    assert.equal(range.value, "40");
    assert.equal(one(root, "humanness-value").textContent, "40");
    assert.match(one(root, "humanness-inherited").textContent, /^Uses your starting value \(40\)\./u);
    assert.equal(one(root, "humanness-inherited").hidden, false);
    assert.equal(clear.hidden, true);
    assert.equal(range.getAttribute("aria-valuetext"), "40, more human-like, your starting value");
    assert.equal(range.getAttribute("type"), "range");
    assert.equal(range.getAttribute("step"), "5");
    assert.equal(range.getAttribute("aria-labelledby"), one(root, "humanness-label").id);
    assert.equal(root.byClass("humanness-ends")[0]!.textContent, "FastestMost human-like");
    const own = mount({ own: 60, starting: 40 }, recording().commit);
    assert.equal(own.root.getAttribute("data-state"), "own");
    assert.equal(own.range.value, "60");
    assert.equal(own.range.getAttribute("aria-valuetext"), "60, more human-like");
    assert.equal(own.clear.hidden, false);
    assert.equal(one(own.root, "humanness-inherited").hidden, true);
  });
});

test("a drag shows each level and commits once, on release", async () => {
  await withFakeDocument(async () => {
    const { sent, commit } = recording();
    const heard: HumannessLevel[] = [];
    const { root, range, status } = mount({ starting: 40 }, commit, heard);
    for (const level of ["45", "50", "55"]) {
      range.value = level;
      range.dispatch("input");
    }
    assert.deepEqual(sent, [], "nothing is sent while it moves");
    assert.equal(one(root, "humanness-value").textContent, "55");
    assert.equal(root.getAttribute("data-state"), "own");
    range.dispatch("change");
    assert.deepEqual(sent, [55]);
    assert.equal(status.textContent, "Saving…");
    assert.equal(root.getAttribute("data-status"), "pending");
    await settle();
    assert.equal(status.textContent, "Saved.");
    assert.equal(status.getAttribute("data-tone"), "ok");
    assert.deepEqual(heard, [{ own: 55, starting: 40 }]);
    range.dispatch("change");
    await settle();
    assert.deepEqual(sent, [55], "a level already saved is not sent again");
  });
});

test("Use starting value sends null and shows the starting value again", async () => {
  await withFakeDocument(async () => {
    const { sent, commit } = recording();
    const { control, root, range, clear } = mount({ own: 80, starting: 25 }, commit);
    clear.dispatch("click");
    assert.deepEqual(sent, [null]);
    assert.equal(range.value, "25");
    await settle();
    assert.equal(root.getAttribute("data-state"), "inherited");
    assert.match(one(root, "humanness-inherited").textContent, /\(25\)/u);
    assert.deepEqual(control.level(), { starting: 25 });
  });
});

test("a refusal goes back to what was saved and says the host's words", async () => {
  await withFakeDocument(async () => {
    const sentence = "Humanness must be a whole number from 0 to 100.";
    const { sent, commit } = recording(async () => ({ ok: false, sentence, code: "automation.task_humanness_out_of_range" }));
    const heard: HumannessLevel[] = [];
    const { root, range, status } = mount({ starting: 40 }, commit, heard);
    range.value = "70";
    range.dispatch("change");
    await settle();
    assert.deepEqual(sent, [70]);
    assert.equal(range.value, "40");
    assert.equal(root.getAttribute("data-state"), "inherited");
    assert.equal(status.textContent, `Not saved. ${sentence}`);
    assert.equal(status.getAttribute("role"), "alert");
    assert.equal(status.getAttribute("data-tone"), "error");
    assert.deepEqual(heard, [{ starting: 40 }]);
    const thrown = mount({ own: 10, starting: 40 }, recording(async () => Promise.reject(new Error("relay closed"))).commit);
    thrown.range.value = "20";
    thrown.range.dispatch("change");
    await settle();
    assert.equal(thrown.range.value, "10");
    assert.equal(thrown.status.textContent, "Not saved. Something went wrong. Try again.");
  });
});

test("the arrow keys step by 5 and send once they rest; Home, End and other keys", async () => {
  await withFakeDocument(async () => {
    const { sent, commit } = recording();
    const { range, root } = mount({ own: 42, starting: 0 }, commit);
    assert.equal(key(range, "ArrowRight"), true);
    assert.equal(range.value, "45", "from between two steps, the next step");
    key(range, "ArrowUp");
    assert.equal(range.value, "50");
    assert.equal(range.getAttribute("aria-valuetext"), "50, more human-like");
    assert.deepEqual(sent, [], "not per key press");
    await settle();
    assert.deepEqual(sent, [50]);
    key(range, "ArrowLeft");
    key(range, "ArrowDown");
    assert.equal(one(root, "humanness-value").textContent, "40");
    range.dispatch("blur");
    assert.deepEqual(sent, [50, 40], "leaving sends at once");
    await settle();
    key(range, "Home");
    assert.equal(range.value, "0");
    assert.equal(range.getAttribute("aria-valuetext"), "0, fastest");
    key(range, "ArrowLeft");
    assert.equal(range.value, "0", "never below 0");
    key(range, "End");
    assert.equal(range.getAttribute("aria-valuetext"), "100, most human-like");
    assert.equal(key(range, "Tab"), false, "other keys are the browser's");
    await settle();
    assert.deepEqual(sent, [50, 40, 100]);
  });
});

test("one request at a time: a change made meanwhile waits and only the latest goes; a read then is not shown", async () => {
  await withFakeDocument(async () => {
    const answers: Array<() => void> = [];
    const { sent, commit } = recording((humanness) => new Promise((resolve) => answers.push(() => resolve({ ok: true, value: humanness === null ? {} : { humanness } }))));
    const { control, range } = mount({ starting: 40 }, commit);
    range.value = "60";
    range.dispatch("change");
    range.value = "65";
    range.dispatch("change");
    range.value = "70";
    range.dispatch("change");
    control.show({ own: 5, starting: 40 });
    assert.equal(range.value, "70", "a read never undoes the person's change");
    assert.deepEqual(sent, [60]);
    answers.shift()!();
    await settle();
    assert.deepEqual(sent, [60, 70]);
    answers.shift()!();
    await settle();
    assert.deepEqual(control.level(), { own: 70, starting: 40 });
    control.show({ own: 5, starting: 30 });
    assert.equal(range.value, "5", "settled, a read is shown");
  });
});

test("the words for a level", () => {
  assert.deepEqual([0, 10, 40, 75, 100].map(humannessWords), ["fastest", "a little human-like", "more human-like", "very human-like", "most human-like"]);
});

test("draft mode never commits and never says Saved; it reports drag release, arrow settle and clear", async () => {
  await withFakeDocument(async () => {
    const drafts: Array<number | null> = [];
    const control = createHumannessControl({ mode: "draft", level: { own: 40, starting: 20 }, settleMs: 0, onDraft: (level) => drafts.push(level) });
    const root = fake(control.element);
    const range = one(root, "humanness-range");
    const status = one(root, "humanness-status");
    range.value = "55";
    range.dispatch("input");
    assert.deepEqual(drafts, [], "nothing is reported mid-drag");
    range.dispatch("change");
    assert.deepEqual(drafts, [55]);
    assert.equal(status.textContent, "");
    key(range, "ArrowRight");
    await settle();
    assert.deepEqual(drafts, [55, 60]);
    assert.equal(range.getAttribute("aria-valuetext"), "60, more human-like");
    one(root, "humanness-clear").dispatch("click");
    await settle();
    assert.deepEqual(drafts, [55, 60, null]);
    assert.equal(range.value, "20");
    assert.equal(root.getAttribute("data-state"), "inherited");
    assert.equal(status.textContent, "");
    assert.equal(root.getAttribute("data-status"), "idle");
    control.show({ own: 35, starting: 20 });
    assert.equal(range.value, "35");
  });
});

test("draft mode with canClear false offers no Use starting value, and inputId and explain apply", async () => {
  await withFakeDocument(() => {
    const control = createHumannessControl({ mode: "draft", level: { own: 10, starting: 10 }, canClear: false, inputId: "mine", explain: "Words.", onDraft: () => undefined });
    const root = fake(control.element);
    assert.equal(one(root, "humanness-clear").hidden, true);
    assert.equal(one(root, "humanness-range").id, "mine");
    assert.equal(one(root, "humanness-explain").textContent, "Words.");
  });
});
