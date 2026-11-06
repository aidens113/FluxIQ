// The tasks screen mounted over the fake port: the list and its search, a failed read that
// keeps what was on screen, each kind of details, the actions that follow the port, rename and
// delete, and a screen that is mounted again landing on the same task.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeTasksMemory, createFakeTasksPort, fake, fakeTasks, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import { createTasksScreen, type TasksScreenOptions } from "../index.ts";

const NOW = new Date(2027, 0, 15, 15, 30).getTime();
const PROJECT = "project-1";

type Timer = { run: () => void; ms: number };

async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function mount(overrides: Partial<TasksScreenOptions> & { without?: Parameters<typeof createFakeTasksPort>[0]["without"]; chat?: boolean; keepable?: Parameters<typeof createFakeTasksPort>[0]["keepable"] } = {}) {
  const tasks = fakeTasks(NOW);
  const port = createFakeTasksPort({ tasks: Object.values(tasks), ...(overrides.without === undefined ? {} : { without: overrides.without }), ...(overrides.keepable === undefined ? {} : { keepable: overrides.keepable }) });
  const timers: Timer[] = [];
  const opened: string[] = [];
  const { without: _without, keepable: _keepable, chat, ...rest } = overrides;
  const screen = createTasksScreen({
    port,
    results: port.results,
    projectId: () => PROJECT,
    now: () => NOW,
    ...(chat === false ? {} : { onOpenInChat: (task: { taskId: string }) => opened.push(task.taskId) }),
    timers: { set: (run, ms) => timers.push({ run, ms }), clear: () => undefined },
    ...rest
  });
  return { screen, port, timers, opened, root: fake(screen.element) };
}

const buttons = (root: FakeElement): FakeElement[] => root.querySelectorAll("button");
const keyed = (root: FakeElement, key: string): FakeElement | undefined => buttons(root).find((button) => button.getAttribute("data-key") === key);
const action = (root: FakeElement, name: string): FakeElement | undefined => buttons(root).find((button) => button.getAttribute("data-action") === name);
const named = (root: FakeElement, words: string): FakeElement | undefined => buttons(root).find((button) => button.textContent === words);
const press = async (button: FakeElement | undefined): Promise<void> => {
  assert.notEqual(button, undefined, "a button to press");
  button!.dispatch("click");
  await flush();
};
const rowTitles = (root: FakeElement): string[] => root.byClass("task-row-title").map((title) => title.textContent);

test("the list: rows in the person's words, what needs them first, then days; opening one and coming back", async () => {
  await withFakeDocument(async () => {
    const { screen, root } = mount();
    const changes: boolean[] = [];
    screen.onOpenChange((open) => changes.push(open));
    screen.setActive(true);
    await flush();
    assert.deepEqual(root.byClass("tasks-group-heading").map((heading) => heading.textContent), ["Needs you", "Today", "Yesterday", "Tuesday", "Monday", "Sunday"]);
    assert.equal(rowTitles(root)[0], "Check my saved searches for new listings");
    assert.ok(rowTitles(root).includes("Find the cheapest kettles on the shop"));
    const states = root.byClass("task-row-state").map((state) => state.textContent);
    assert.ok(states.includes("Needs your answer") && states.includes("Working") && states.includes("Ran out of budget") && states.includes("You stopped it"));
    assert.equal(root.byClass("task-row-mark").length, 1, "a tick only for the one result that is confirmed");
    assert.equal(root.getAttribute("data-mode"), "list");

    await press(keyed(root, "row:task-deals"));
    assert.equal(root.getAttribute("data-mode"), "details");
    assert.equal(screen.isOpen(), true);
    assert.equal(root.byClass("task-title")[0]!.textContent, "Find the cheapest kettles on the shop");
    assert.match(root.byClass("task-progress")[0]!.textContent, /^Finished in 3 steps\. The last one was “Read the first 10 rows”\.$/u);
    assert.equal(root.byClass("attempt-item").length, 2);
    assert.deepEqual(root.byClass("attempt-compared").map((line) => line.textContent), ["This time 18s and $0.00. First time 3m 14s and $1.12."]);
    assert.ok(root.byClass("answer-card").length === 1, "the latest answer is the answer turn's own");

    assert.equal(screen.back(), true);
    assert.equal(root.getAttribute("data-mode"), "list");
    assert.equal(screen.back(), false);
    assert.deepEqual(changes, [true, false], "the host is told when a task opens and closes");
  });
});

test("Escape leaves an open task", async () => {
  await withFakeDocument(async () => {
    const { screen, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-jobs"));
    root.dispatch("keydown", { key: "Escape", preventDefault: () => undefined });
    await flush();
    assert.equal(root.getAttribute("data-mode"), "list");
  });
});

test("search waits a moment, asks the port for the text, and says how many match", async () => {
  await withFakeDocument(async () => {
    const { screen, port, timers, root } = mount();
    const counts: Array<number | null> = [];
    screen.onMatches((count) => counts.push(count));
    screen.setActive(true);
    await flush();
    screen.search("cheap");
    assert.equal(timers.length, 1);
    assert.equal(timers[0]!.ms, 250);
    assert.equal(port.calls.filter((call) => call.method === "list").length, 1, "nothing asked before the pause");
    timers[0]!.run();
    await flush();
    assert.deepEqual(rowTitles(root), ["Find the cheapest kettles on the shop"]);
    assert.equal(port.calls.filter((call) => call.method === "list").at(-1)?.query && (port.calls.filter((call) => call.method === "list").at(-1)!.query as { text?: string }).text, "cheap");
    assert.deepEqual(counts.at(-1), 1);
    screen.search("zzz");
    timers[1]!.run();
    await flush();
    assert.equal(root.byClass("tasks-empty")[0]!.textContent, "No tasks match “zzz”.");
    screen.search("");
    await flush();
    assert.equal(counts.at(-1), null);
    assert.ok(rowTitles(root).length > 5);
  });
});

test("an empty list says what to do; a failed read is quiet, offers Try again and keeps what was on screen", async () => {
  await withFakeDocument(async () => {
    const empty = createFakeTasksPort({ tasks: [] });
    const first = createTasksScreen({ port: empty, projectId: () => PROJECT, now: () => NOW });
    first.setActive(true);
    await flush();
    assert.match(fake(first.element).byClass("tasks-empty")[0]!.textContent, /^No tasks yet\. Ask for something in the chat/u);

    const { screen, port, root } = mount();
    screen.setActive(true);
    await flush();
    const before = rowTitles(root).length;
    port.failNext("list", { ok: false, sentence: "FluxIQ did not answer just now." });
    screen.setActive(false);
    screen.setActive(true);
    await flush();
    assert.equal(root.byClass("tasks-notice-text")[0]!.textContent, "FluxIQ did not answer just now.");
    assert.equal(rowTitles(root).length, before, "nothing was blanked");
    await press(keyed(root, "list-retry"));
    assert.equal(root.byClass("tasks-notice").length, 0);
    assert.equal(rowTitles(root).length, before);
  });
});

test("an interrupted task offers Carry on, once while it works; the budget-out task offers the answer turn's Add budget once", async () => {
  await withFakeDocument(async () => {
    const { screen, port, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-saved-searches"));
    assert.equal(root.byClass("tasks-wait")[0]!.getAttribute("aria-label"), "Stopped partway");
    assert.equal(root.byClass("answer-card").length, 0, "no answer turn for a wait it has no words for");
    const carry = keyed(root, "carry-on");
    carry!.dispatch("click");
    carry!.dispatch("click");
    await flush();
    assert.equal(port.calls.filter((call) => call.method === "carryOn").length, 1);
    assert.equal(root.byClass("task-state")[0]!.textContent, "Working");
    assert.equal(keyed(root, "carry-on"), undefined, "no longer interrupted");
    screen.back();
    await flush();
    await press(keyed(root, "row:task-listings"));
    const add = action(root, "add-budget");
    assert.equal(add?.textContent, "Add $5.00 and carry on");
    add!.dispatch("click");
    assert.equal(action(root, "add-budget")?.disabled, true, "disabled while pressing, so it cannot be pressed twice");
    await flush();
    assert.equal(port.calls.filter((call) => call.method === "results.addBudgetAndCarryOn").length, 1);
    assert.equal(root.byClass("task-state")[0]!.textContent, "Working", "the same attempt goes on");
  });
});

test("Run again carries the answer turn's note; waiting for a locked model key says so and offers no failure", async () => {
  await withFakeDocument(async () => {
    const { screen, port, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-cart"));
    assert.match(root.byClass("answer-again-note")[0]?.textContent ?? "", /Run again does the task again/u);
    await press(action(root, "run-again"));
    assert.equal(port.calls.filter((call) => call.method === "results.runAgain").length, 1);
    screen.back();
    await flush();
    await press(keyed(root, "row:task-news-summary"));
    assert.equal(root.byClass("tasks-wait")[0]!.getAttribute("aria-label"), "Waiting for your model key");
    assert.equal(keyed(root, "carry-on"), undefined);
    assert.doesNotMatch(root.textContent, /\bfailed\b/iu);
  });
});

test("steps open on request with their reasoning, marked from saved or worked out again", async () => {
  await withFakeDocument(async () => {
    const { screen, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-deals"));
    assert.equal(root.byClass("step-item").length, 0, "closed until asked");
    await press(keyed(root, "steps:attempt-deals-2"));
    assert.deepEqual(root.byClass("step-kind").map((kind) => kind.textContent), ["From saved steps", "Worked out again"]);
    assert.ok(root.byClass("step-reason").some((reason) => reason.textContent === "The task asks for the cheapest."));
    await press(keyed(root, "steps:attempt-deals-1"));
    assert.equal(root.byClass("step-quiet").length, 1, "small steps are folded");
    assert.equal(root.byClass("step-kind").length, 2, "no provenance for the first attempt, nothing marked there");
    await press(buttons(root).find((button) => (button.getAttribute("data-key") ?? "").startsWith("quiet:")));
    assert.equal(root.byClass("steps-quiet-list").length, 1);
  });
});

test("every optional method absent means its control is not drawn", async () => {
  await withFakeDocument(async () => {
    const { screen, root } = mount({ without: ["readSteps", "carryOn", "rename", "remove"], chat: false });
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-saved-searches"));
    for (const key of ["carry-on", "rename", "delete", "open-in-chat", "steps:attempt-saved-searches-1"]) assert.equal(keyed(root, key), undefined, `no ${key}`);
    assert.ok(keyed(root, "back"), "Back stays");
  });
});

test("rename inline: Enter keeps it, Escape leaves it; a refusal stays in the box", async () => {
  await withFakeDocument(async () => {
    const { screen, port, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-jobs"));
    await press(keyed(root, "rename"));
    const box = root.descendants().find((element) => element.getAttribute("data-key") === "rename-input")!;
    box.value = "Morning job posts";
    box.dispatch("input");
    port.failNext("rename", { ok: false, sentence: "That name is taken." });
    box.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await flush();
    assert.equal(root.byClass("tasks-error")[0]!.textContent, "That name is taken.");
    const again = root.descendants().find((element) => element.getAttribute("data-key") === "rename-input")!;
    assert.equal(again.value, "Morning job posts");
    again.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await flush();
    assert.equal(root.byClass("task-title")[0]!.textContent, "Morning job posts");
    await press(keyed(root, "rename"));
    root.descendants().find((element) => element.getAttribute("data-key") === "rename-input")!.dispatch("keydown", { key: "Escape", stopPropagation: () => undefined });
    await flush();
    assert.equal(root.byClass("task-title")[0]!.textContent, "Morning job posts");
  });
});

test("delete asks what goes and what stays, can be refused, and then the task is gone from the list", async () => {
  await withFakeDocument(async () => {
    const { screen, port, root } = mount();
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-news"));
    await press(keyed(root, "delete"));
    assert.match(root.byClass("tasks-confirm-question")[0]!.textContent, /^Delete “Read the headlines”\?$/u);
    assert.match(root.textContent, /automation or subflow it saved stays/u);
    await press(keyed(root, "delete-cancel"));
    assert.equal(root.byClass("tasks-confirm").length, 0);
    assert.equal(port.calls.filter((call) => call.method === "remove").length, 0);
    await press(keyed(root, "delete"));
    await press(keyed(root, "delete-confirm"));
    assert.equal(port.calls.filter((call) => call.method === "remove").length, 1);
    assert.equal(root.getAttribute("data-mode"), "list");
    assert.ok(!rowTitles(root).includes("Read the headlines"));
    assert.match(root.byClass("tasks-note")[0]!.textContent, /^Deleted “Read the headlines”\.$/u);
  });
});

test("closing and mounting again lands on the same task, and a task that is gone says so quietly", async () => {
  await withFakeDocument(async () => {
    const memory = createFakeTasksMemory();
    const first = mount({ memory });
    first.screen.setActive(true);
    await flush();
    await press(keyed(first.root, "row:task-hours"));
    assert.deepEqual(memory.open, { projectId: PROJECT, taskId: "task-hours" });
    let restored = 0;
    const again = mount({ memory, onRestored: () => restored++ });
    again.screen.restore();
    again.screen.restore();
    again.screen.setActive(true);
    await flush();
    assert.equal(restored, 1);
    assert.equal(again.root.getAttribute("data-mode"), "details");
    assert.equal(again.root.byClass("task-title")[0]!.textContent, "What time does the shop close on Sundays?");
    assert.equal(again.root.byClass("task-state")[0]!.textContent, "Finished, not confirmed");
    again.screen.back();
    await flush();
    assert.equal(memory.open, undefined);

    const gone = createFakeTasksMemory({ projectId: PROJECT, taskId: "task-removed" });
    const lost = mount({ memory: gone });
    lost.screen.restore();
    lost.screen.setActive(true);
    await flush();
    assert.equal(lost.root.byClass("tasks-notice-text")[0]!.textContent, "That task could not be found.");
    assert.ok(keyed(lost.root, "details-retry"));
    await press(keyed(lost.root, "back"));
    assert.equal(lost.root.getAttribute("data-mode"), "list");
  });
});

test("save this: drawn on a task whose Flow has one subflow worth keeping, kept in plain words, a refusal in Core's own sentence, and nothing where there is none", async () => {
  await withFakeDocument(async () => {
    const { screen, root, port } = mount({ keepable: { "flow-saved-searches": { subflowId: "sub-1", name: "Check saved searches" } } });
    screen.setActive(true);
    await flush();
    await press(keyed(root, "row:task-saved-searches"));
    assert.match(root.textContent, /Keep “Check saved searches” in your Library, so other automations can use it\./u);
    port.refuseKeepNext({ code: "part.not_found", message: "That piece is not part of this automation any more." });
    await press(named(root, "Save this"));
    assert.match(root.textContent, /That piece is not part of this automation any more\./u);
    assert.ok(!/part\.not_found/u.test(root.textContent));
    await press(named(root, "Save this"));
    assert.match(root.textContent, /Saved\. Find it in your Library\./u);
    assert.deepEqual(port.calls.filter((call) => call.method === "keepSubflow").map((call) => call.query), [
      { projectId: PROJECT, flowId: "flow-saved-searches", subflowId: "sub-1" },
      { projectId: PROJECT, flowId: "flow-saved-searches", subflowId: "sub-1" }
    ]);
  });
});

test("save this: not drawn for a task whose Flow has nothing to keep, or when the port cannot save", async () => {
  await withFakeDocument(async () => {
    const none = mount();
    none.screen.setActive(true);
    await flush();
    await press(keyed(none.root, "row:task-saved-searches"));
    assert.equal(named(none.root, "Save this"), undefined);
    const cannot = mount({ keepable: { "flow-saved-searches": { subflowId: "sub-1", name: "Check saved searches" } }, without: ["keepSubflow"] });
    cannot.screen.setActive(true);
    await flush();
    await press(keyed(cannot.root, "row:task-saved-searches"));
    assert.equal(named(cannot.root, "Save this"), undefined);
  });
});
