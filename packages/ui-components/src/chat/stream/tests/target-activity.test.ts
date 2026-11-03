// The latest chat shows all of FluxIQ's live activity; an automation's chat
// shows only the work on that automation, and its live line only while that
// work is what the paced display describes.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActivityDisplay, ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent, relayState } from "../../tests/activity-fixture.ts";
import { activityForTarget } from "../target-activity.ts";

const AUTOMATION = { kind: "automation", flowId: "flow-7", name: "Price tracker" } as const;

test("explicit project excludes foreign or unknown activity and waiting asks, preserving unscoped history", () => {
  const own = activityEvent(1, { activityId: "build:new", subject: { kind: "build", id: "new", projectId: "new", flowId: "new-flow" } });
  const old = activityEvent(2, { activityId: "build:old", subject: { kind: "build", id: "old", projectId: "old", flowId: "old-flow" } });
  // Raw wire activity from a Core that predates project scoping carries no
  // projectId; the contract now requires one, so the case is typed as such.
  const unknown = activityEvent(3, { activityId: "build:unknown", subject: { kind: "build", id: "unknown", flowId: "unknown-flow" } as ClientGatewayActivity["subject"] });
  for (const waiting of [old, unknown]) {
    const state = relayState([own, old, unknown], { display: { ...display(waiting.activityId), outcome: "waiting" } });
    const scoped = activityForTarget(state, { kind: "project", projectId: "new" }, undefined);
    assert.deepEqual(scoped.events.map(event => event.activityId), [own.activityId]);
    assert.equal(scoped.display, null);
    assert.equal(scoped.answerIn, null);
    assert.equal(activityForTarget(state, { kind: "latest" }, undefined).events.length, 3);
  }
  const state = relayState([own, old], { display: { ...display(own.activityId), outcome: "waiting" } });
  const scoped = activityForTarget(state, { kind: "latest", projectId: "new" }, undefined);
  assert.equal(scoped.display?.activityId, own.activityId);
  assert.equal(scoped.answerIn?.projectId, "new");
});

function display(activityId: string): ActivityDisplay {
  return { activityId, subjectKind: "run", phase: "running", headline: "Running your Flow", detail: null, step: null, working: true, outcome: null, sequence: 3 };
}

const ours = activityEvent(1, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p", flowId: "flow-7" } });
const theirs = activityEvent(2, { activityId: "run:r2", subject: { kind: "run", id: "r2", projectId: "p", flowId: "flow-8" } });
const spoken = activityEvent(3, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p" }, conversationId: "conv-flow" });

test("the latest chat shows everything", () => {
  const state = relayState([ours, theirs, spoken], { display: display("run:r2") });
  const shown = activityForTarget(state, { kind: "latest" }, undefined);
  assert.equal(shown.events.length, 3);
  assert.equal(shown.display?.activityId, "run:r2");
});

test("an automation's chat shows its own Flow's work and what speaks through its thread", () => {
  const state = relayState([ours, theirs, spoken], { display: display("run:r1") });
  const shown = activityForTarget(state, AUTOMATION, "conv-flow");
  assert.deepEqual(shown.events.map((event) => event.activityId), ["run:r1", "build:b1"]);
  assert.equal(shown.display?.activityId, "run:r1");
  assert.deepEqual(activityForTarget(state, AUTOMATION, undefined).events.map((event) => event.activityId), ["run:r1"]);
});

test("another automation's work never moves this chat's live line", () => {
  const state = relayState([ours, theirs], { display: display("run:r2") });
  assert.equal(activityForTarget(state, AUTOMATION, undefined).display, null);
});

test("work that speaks through another thread never shows in this one, in either chat", () => {
  const otherThread = activityEvent(4, { activityId: "build:b9", subject: { kind: "build", id: "b9", projectId: "p", flowId: "flow-7" }, conversationId: "conv-other" });
  const earlier = activityEvent(3, { activityId: "build:b9", subject: { kind: "build", id: "b9", projectId: "p", flowId: "flow-7" } });
  const state = relayState([ours, earlier, otherThread], { display: display("build:b9") });
  const latest = activityForTarget(state, { kind: "latest" }, "conv-latest");
  assert.deepEqual(latest.events.map((event) => event.activityId), ["run:r1"]);
  assert.equal(latest.display, null, "the live line does not describe another thread's work");
  assert.deepEqual(activityForTarget(state, AUTOMATION, "conv-flow").events.map((event) => event.activityId), ["run:r1"]);
  assert.equal(activityForTarget(state, { kind: "latest" }, undefined).events.length, 3, "with no thread yet, nothing is anyone else's");
});

// Waiting on the person. Core asks in the thread of the work's own subject (a
// build in its Flow's, a run in its own), so the question is often not in the
// thread on screen, and a run started from the automations tab asks in a
// thread no chat shows. Every chat shows the wait; `answerIn` names the thread
// to open when the question is not the one on screen.

const ASK = "FluxIQ needs you: complete the check on this page, then press Continue.";

function waitingOn(activityId: string, subjectKind: "build" | "run"): ActivityDisplay {
  return { activityId, subjectKind, phase: "waiting_permission", headline: "Waiting for you", detail: ASK, step: null, working: false, outcome: "waiting", sequence: 9 };
}

const tabRun = activityEvent(5, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p", flowId: "flow-7" }, phase: "waiting_permission" });
const chatBuild = activityEvent(6, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p", flowId: "flow-7" }, conversationId: "conv-latest", phase: "waiting_permission" });
const otherThreadRun = activityEvent(7, { activityId: "run:r3", subject: { kind: "run", id: "r3", projectId: "p", flowId: "flow-8" }, conversationId: "conv-other", phase: "waiting_permission" });

test("a run started from the automations tab waits in its own thread: the latest chat shows the wait and where to answer", () => {
  const state = relayState([tabRun], { display: waitingOn("run:r1", "run") });
  const shown = activityForTarget(state, { kind: "latest" }, "conv-latest");
  assert.equal(shown.display?.outcome, "waiting");
  assert.deepEqual(shown.answerIn, { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "The run's question", projectId: "p" });
});

test("a build started from the latest chat asks in its Flow's thread: the latest chat offers it, the automation's chat holds it", () => {
  const state = relayState([chatBuild], { display: waitingOn("build:b1", "build") });
  const latest = activityForTarget(state, { kind: "latest" }, "conv-latest");
  assert.equal(latest.display?.activityId, "build:b1");
  assert.equal(latest.answerIn?.subjectKind, "flow");
  assert.equal(latest.answerIn?.subjectId, "flow-7");
  const automation = activityForTarget(state, AUTOMATION, "conv-flow");
  assert.equal(automation.display?.outcome, "waiting", "the wait shows although the build speaks through the latest thread");
  assert.equal(automation.answerIn, null, "the question is in the thread on screen");
  assert.deepEqual(automation.events, [], "its steps still belong to the thread it speaks through");
});

test("work waiting in a thread no chat on screen shows is shown in every chat, with where to answer", () => {
  const state = relayState([otherThreadRun], { display: waitingOn("run:r3", "run") });
  for (const [target, conversationId] of [[{ kind: "latest" }, "conv-latest"], [AUTOMATION, "conv-flow"]] as const) {
    const shown = activityForTarget(state, target, conversationId);
    assert.equal(shown.display?.activityId, "run:r3");
    assert.equal(shown.answerIn?.subjectId, "r3");
    assert.deepEqual(shown.events, []);
  }
});

test("the question's own chat shows the work that asked, and needs no way to answer elsewhere", () => {
  const state = relayState([ours, otherThreadRun], { display: waitingOn("run:r3", "run") });
  const question = { kind: "question", activityId: "run:r3", subjectKind: "run", subjectId: "r3", title: "The run's question" } as const;
  const shown = activityForTarget(state, question, "conv-run-r3");
  assert.deepEqual(shown.events.map((event) => event.activityId), ["run:r3"], "its events show though they name the thread it was started from");
  assert.equal(shown.display?.activityId, "run:r3");
  assert.equal(shown.answerIn, null);
});

test("nothing is offered while the work runs, and a settled display stays off another chat", () => {
  const running = relayState([otherThreadRun], { display: { ...waitingOn("run:r3", "run"), working: true, outcome: null, phase: "running" } });
  const shown = activityForTarget(running, { kind: "latest" }, "conv-latest");
  assert.equal(shown.display, null);
  assert.equal(shown.answerIn, null);
  const settled = relayState([otherThreadRun], { display: { ...waitingOn("run:r3", "run"), outcome: "done", phase: "done" } });
  assert.equal(activityForTarget(settled, AUTOMATION, "conv-flow").display, null);
});

test("the chat's events are the relay's history when it keeps one, filtered the same way; recent is the fallback", () => {
  const early = activityEvent(1, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p", flowId: "flow-7" }, detail: { kind: "thought", title: "Opening the shop", text: "It starts there.", status: "succeeded" } });
  const elsewhere = activityEvent(2, { activityId: "build:b2", subject: { kind: "build", id: "b2", projectId: "p" }, conversationId: "conv-other", detail: { kind: "note", title: "Other" } });
  const late = activityEvent(90, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p", flowId: "flow-7" } });
  const state = relayState([late], { history: [early, elsewhere], display: display("build:b1") });
  const latest = activityForTarget(state, { kind: "latest" }, "conv-latest");
  assert.deepEqual(latest.events, [early], "the history's first decision, long gone from recent; another thread's work is not here");
  assert.equal(latest.display?.activityId, "build:b1");
  assert.deepEqual(activityForTarget(state, AUTOMATION, undefined).events, [early]);
  assert.deepEqual(activityForTarget(relayState([late]), { kind: "latest" }, undefined).events, [late]);
});

// R2-U-5 (run-muwansvz-a2b4a987, moment 02): the panel said "Sending your
// message" for ~1.6 s while the overlay said "Starting…". The starting status
// the relay puts up as a send leaves (`background/activity/send-start.ts`) is
// no event of Core's, so a project's chat, which shows only a display some
// event of its project carries, never showed it.
test("the starting status a send puts up shows in every chat, a project's too, until Core's first activity replaces it", () => {
  const starting: ActivityDisplay = { activityId: "starting:1", subjectKind: "build", phase: "thinking", headline: "Starting…", detail: null, step: null, working: true, outcome: null, sequence: 0, kind: "starting" };
  const earlier = activityEvent(1, { activityId: "build:old", subject: { kind: "build", id: "old", projectId: "p", flowId: "flow-7" }, conversationId: "conv-other" });
  const state = relayState([earlier], { display: starting });
  for (const [target, conversationId] of [
    [{ kind: "project", projectId: "p" }, undefined],
    [{ kind: "latest", projectId: "p" }, "conv-latest"],
    [{ kind: "latest" }, "conv-latest"],
    [AUTOMATION, "conv-flow"]
  ] as const) {
    assert.equal(activityForTarget(state, target, conversationId).display?.headline, "Starting…", JSON.stringify(target));
  }
});
