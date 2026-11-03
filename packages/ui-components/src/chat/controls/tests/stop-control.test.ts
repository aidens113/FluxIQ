import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { createStopControl } from "../stop-control.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { runsOver, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatRunPort } from "../../ports/index.ts";

const activity = (kind: "build" | "run", id = "work"): ClientGatewayActivity => ({ activityId: `${kind}:${id}`, sequence: 1,
  subject: { kind, id, projectId: "p", flowId: "f" }, phase: "building", label: "Working", at: "2026-10-06T00:00:00Z" });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test("Stop targets build Flow and run ID, waits for final activity and prevents duplicate clicks", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    const control = createStopControl(runsOver(async (message) => {
      sent.push(message);
      return { ok: true, value: { ok: true } };
    }), () => true);
    const button = fake(control.element).byClass("chat-stop")[0]!;
    control.update(activity("build"));
    assert.equal(control.element.hidden, false);
    assert.equal(button.textContent, "Stop");
    assert.equal(button.getAttribute("aria-label"), "Stop build", "the accessible name says what it stops");
    button.dispatch("click");
    button.dispatch("click");
    await settle();
    assert.deepEqual(sent, [{ type: "fluxiq.panel.stopRun", projectId: "p", flowId: "f" }]);
    assert.equal(button.disabled, true);
    assert.match(fake(control.element).textContent, /Waiting for the work/);
    control.update({ ...activity("build"), final: true, phase: "failed" });
    assert.equal(control.element.hidden, true);
    control.update(activity("run", "r"));
    button.dispatch("click");
    await settle();
    assert.deepEqual(sent[1], { type: "fluxiq.panel.stopRun", projectId: "p", runId: "r" });
  });
});

test("disconnected ownership and terminal activity cannot Stop; a failed Stop is retryable", async () => {
  await withFakeDocument(async () => {
    let eligible = true, calls = 0;
    const control = createStopControl(runsOver(async () => {
      calls++;
      return { ok: true, value: { ok: false } };
    }), () => eligible);
    const button = fake(control.element).byClass("chat-stop")[0]!;
    control.update(activity("build"));
    eligible = false;
    button.dispatch("click");
    assert.equal(calls, 0);
    eligible = true;
    button.dispatch("click");
    await settle();
    assert.equal(button.disabled, false);
    assert.match(fake(control.element).textContent, /Couldn't stop/);
    control.update({ ...activity("build"), final: true });
    button.dispatch("click");
    assert.equal(calls, 1);
  });
});

/** A relay that accepts every stop, for whatever reply type the control reads it as. */
function accepting(sent: TestMessage[]): ChatRunPort {
  return runsOver(async (message) => {
    sent.push(message);
    return { ok: true, value: { ok: true, payload: {} } };
  });
}

// D9 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, moment 02): no Stop
// while the panel and the overlay said "Starting…".
test("Stop shows during Starting…, and a press then is sent for the work the send starts", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    const control = createStopControl(accepting(sent), () => true);
    const button = fake(control.element).byClass("chat-stop")[0]!;
    control.update(null, true);
    assert.equal(control.element.hidden, false, "offered while starting");
    assert.equal(button.textContent, "Stop");
    button.dispatch("click");
    await settle();
    assert.deepEqual(sent, [], "nothing is named yet, so nothing is sent");
    assert.equal(button.disabled, true);
    assert.match(fake(control.element).textContent, /as soon as it starts/);
    control.update(activity("build"));
    await settle();
    assert.deepEqual(sent, [{ type: "fluxiq.panel.stopRun", projectId: "p", flowId: "f" }]);
    assert.match(fake(control.element).textContent, /Waiting for the work/);
  });
});

test("a press during Starting… is dropped when the send starts nothing", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    const control = createStopControl(accepting(sent), () => true);
    const button = fake(control.element).byClass("chat-stop")[0]!;
    control.update(null, true);
    button.dispatch("click");
    control.update(null, false);
    assert.equal(control.element.hidden, true);
    control.update(activity("build"));
    await settle();
    assert.deepEqual(sent, [], "a later build is not stopped by a press its send never led to");
    assert.equal(button.disabled, false);
  });
});

// Round 5: the button read "Stop" while the send said "Starting…" and "Stop
// build" once Core named the build. One label from the first moment to the end.
test("Stop keeps one label for the whole build, from Starting… until it ends", async () => {
  await withFakeDocument(async () => {
    const control = createStopControl(accepting([]), () => true);
    const button = fake(control.element).byClass("chat-stop")[0]!;
    const labels: string[] = [];
    control.update(null, true);
    labels.push(button.textContent);
    control.update(activity("build"));
    labels.push(button.textContent);
    control.update({ ...activity("build"), sequence: 2, phase: "exploring" });
    labels.push(button.textContent);
    assert.deepEqual(labels, ["Stop", "Stop", "Stop"]);
    control.update(activity("run", "r"));
    assert.equal(button.textContent, "Stop", "a run's Stop reads the same");
    assert.equal(button.getAttribute("aria-label"), "Stop run");
  });
});
