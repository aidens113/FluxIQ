// The mounted work header: one Stop element for the chat's life, a time that
// ticks once a second and holds its width, the cost segment, and live regions
// that never carry the time.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ActivityDisplay, ClientGatewayActivity } from "fluxiq/ui";
import { createStopControl } from "../../controls/index.ts";
import { runsOver, type TestMessage } from "../../tests/message-transport.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createWorkHeaderView, type WorkHeaderView } from "../work-header-view.ts";

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
let clock = T0;
beforeEach(() => {
  clock = T0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
const tick = (ms: number) => {
  clock += ms;
  vi.advanceTimersByTime(ms);
};

const activity = (fields: Partial<ClientGatewayActivity> = {}): ClientGatewayActivity => ({ activityId: "build:b1", sequence: 1, subject: { kind: "build", id: "b1", projectId: "p", flowId: "f" },
  phase: "exploring", label: "Working", at: new Date(T0).toISOString(), ...fields });
const display = (fields: Partial<ActivityDisplay> = {}): ActivityDisplay => ({ activityId: "build:b1", subjectKind: "build", phase: "exploring", headline: "Working on your task",
  detail: "Opening the results page", step: null, working: true, outcome: null, sequence: 1, ...fields });

function mount(sent: TestMessage[] = []) {
  const stop = createStopControl(runsOver(async (message) => {
    sent.push(message);
    return { ok: true, value: { ok: true } };
  }), () => true);
  const opened: string[] = [];
  const view = createWorkHeaderView({ controls: [stop.element], onAction: () => opened.push("question"), now: () => clock });
  const root = fake(view.element);
  const text = (name: string) => root.byClass(name)[0]!.textContent;
  const hidden = (name: string) => root.byClass(name)[0]!.hidden;
  return { stop, view, root, text, hidden, opened, sent };
}

function render(view: WorkHeaderView, stop: ReturnType<typeof createStopControl>, live: ClientGatewayActivity | null, shown: ActivityDisplay | null, sending = false, more: object = {}) {
  stop.update(live, sending);
  view.update({ display: shown, activity: live, sending, ...more });
}

test("the header reads state, ticking time, cost and the current step, and the time ticks once a second", async () => {
  await withFakeDocument(() => {
    const { view, stop, text, hidden, root } = mount();
    assert.equal(view.element.hidden, true);
    render(view, stop, activity(), display(), false, { meter: { usd: 0.34, budgetUsd: 5 } });
    assert.equal(view.element.hidden, false);
    assert.deepEqual([text("chat-work-label"), text("chat-work-time"), text("chat-work-cost"), text("chat-work-now")], ["Working", "0s", "$0.34 of $5.00", "Opening the results page"]);
    assert.equal(hidden("chat-work-limit"), true);
    tick(72_000);
    assert.equal(text("chat-work-time"), "1m 12s", "ticked with no new render");
    assert.equal(root.byClass("chat-work-time")[0]!.getAttribute("aria-live"), null, "the time is never announced");
    view.destroy();
  });
});

test("the time starts at the first event's own time, never in the future, and the host's start wins", async () => {
  await withFakeDocument(() => {
    const { view, stop, text } = mount();
    render(view, stop, activity({ at: new Date(T0 - 45_000).toISOString() }), display());
    assert.equal(text("chat-work-time"), "45s", "the work began before the panel looked");
    render(view, stop, activity({ at: new Date(T0 - 45_000).toISOString() }), display(), false, { meter: { startedAtMs: T0 - 600_000 } });
    assert.equal(text("chat-work-time"), "10m 00s");
    view.destroy();
  });
  await withFakeDocument(() => {
    const { view, stop, text } = mount();
    render(view, stop, activity({ at: new Date(T0 + 99_000).toISOString() }), display());
    assert.equal(text("chat-work-time"), "0s");
    view.destroy();
  });
});

test("near the limit it says so in words; with no meter there is no cost", async () => {
  await withFakeDocument(() => {
    const { view, stop, text, hidden } = mount();
    render(view, stop, activity(), display());
    assert.equal(hidden("chat-work-cost"), true);
    render(view, stop, activity(), display(), false, { meter: { usd: 4.5, budgetUsd: 5 } });
    assert.equal(hidden("chat-work-cost"), false);
    assert.equal(text("chat-work-limit"), "Close to the limit");
    assert.equal(view.element.getAttribute("data-near-limit"), "true");
    view.destroy();
  });
});

test("waiting shows what it waits for and Show the question only when the question is elsewhere; the button is pressed through onAction", async () => {
  await withFakeDocument(() => {
    const { view, stop, text, hidden, root, opened } = mount();
    const waiting = display({ working: false, outcome: "waiting", phase: "waiting_permission", headline: "Waiting for you: finish the check on the page", detail: "FluxIQ needs you: complete the check" });
    render(view, stop, activity({ phase: "waiting_permission" }), waiting);
    assert.deepEqual([view.element.getAttribute("data-state"), text("chat-work-label"), text("chat-work-now")], ["waiting", "Waiting for you", "Finish the check on the page"]);
    assert.equal(hidden("chat-work-action"), true);
    render(view, stop, activity({ phase: "waiting_permission" }), waiting, false, { questionElsewhere: true });
    assert.equal(text("chat-work-action"), "Show the question");
    root.byClass("chat-work-action")[0]!.dispatch("click");
    assert.deepEqual(opened, ["question"]);
    view.destroy();
  });
});

test("one Stop element for the chat's life: the same node through sending, working, waiting and a held press, with the Lab's hooks", async () => {
  await withFakeDocument(async () => {
    vi.useRealTimers();
    const { view, stop, root, text, sent } = mount();
    const first = root.byClass("chat-stop")[0]!;
    assert.equal(root.byClass("chat-stop-control").length, 1, "the control's own element sits inside the header");
    render(view, stop, null, null, true);
    assert.equal(text("chat-work-label"), "Sending your message");
    assert.equal(view.element.hidden, false);
    first.dispatch("click");
    assert.equal(first.disabled, true, "a press while starting is held");
    assert.equal(first.textContent, "Stopping…");
    assert.match(text("chat-stop-status"), /Stopping as soon as it starts/);
    render(view, stop, activity(), display());
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(sent, [{ type: "fluxiq.panel.stopRun", projectId: "p", flowId: "f" }], "the held press is sent once work is named");
    assert.equal(root.byClass("chat-stop")[0], first);
    render(view, stop, activity({ phase: "waiting_permission" }), display({ working: false, outcome: "waiting", headline: "Waiting for you: answer" }));
    assert.equal(root.byClass("chat-stop")[0], first);
    assert.equal(root.byClass("chat-stop").length, 1);
    view.destroy();
  });
});

test("the header stays up while Stop is offered, and hides with it; the timer stops when the header hides", async () => {
  await withFakeDocument(() => {
    const { view, stop, text } = mount();
    render(view, stop, activity(), null);
    assert.equal(view.element.hidden, false, "no display yet, but Stop is offered");
    assert.equal(text("chat-work-label"), "Working");
    render(view, stop, activity({ final: true, phase: "done" }), display({ working: false, outcome: "done" }));
    assert.equal(view.element.hidden, true);
    assert.equal(vi.getTimerCount(), 0, "nothing ticks while hidden");
    view.destroy();
  });
});

test("the live regions carry the state and the line, and never the time or the cost", async () => {
  await withFakeDocument(() => {
    const { view, root } = mount();
    const live = root.descendants().filter((node) => node.getAttribute("aria-live") !== null).map((node) => node.className);
    assert.deepEqual(live.filter((name) => name.startsWith("chat-work")).sort(), ["chat-work-label", "chat-work-now"]);
    view.destroy();
  });
});
