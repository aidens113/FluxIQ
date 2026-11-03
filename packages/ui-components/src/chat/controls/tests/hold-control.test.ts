// Take over and Hand back beside Stop (`hold-control.ts`): only for a run
// while it works, named by the run's id, the held sentence with Hand back,
// a press disabled until Core's activity moves, a failure that can be
// retried, and a reply for an older run or owner that changes nothing.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { createHoldControl } from "../hold-control.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { runsOver, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult, ChatRunPort } from "../../ports/index.ts";

const run = (fields: Partial<ClientGatewayActivity> = {}, id = "r1"): ClientGatewayActivity => ({ activityId: `run:${id}`, sequence: 1,
  subject: { kind: "run", id, projectId: "p", flowId: "f" }, phase: "running", label: "Running step 2 of 5", at: "2026-10-08T00:00:00Z", ...fields });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** A relay that answers each press with `reply`, recording what was sent. */
function relay(sent: TestMessage[], reply: () => Promise<ChatResult<unknown>>): ChatRunPort {
  return runsOver(async (message) => {
    sent.push(message);
    return await reply();
  });
}
const accepted = async (): Promise<ChatResult<unknown>> => ({ ok: true, value: { ok: true, payload: {} } });

test("Take over shows only for a run while it works, never for a build or ended work", async () => {
  await withFakeDocument(async () => {
    const control = createHoldControl(relay([], accepted), () => true);
    const button = fake(control.element).byClass("chat-hold")[0]!;
    control.update(null);
    assert.equal(control.element.hidden, true);
    control.update({ ...run(), activityId: "build:b", subject: { kind: "build", id: "b", projectId: "p", flowId: "f" }, phase: "building" });
    assert.equal(control.element.hidden, true, "builds never offer Take over");
    control.update(run());
    assert.equal(control.element.hidden, false);
    assert.equal(button.textContent, "Take over");
    assert.equal(fake(control.element).byClass("chat-hold-sentence")[0]!.hidden, true);
    control.update(run({ phase: "waiting_permission" }));
    assert.equal(control.element.hidden, true, "a run waiting on a question");
    control.update(run({ phase: "done", final: true }));
    assert.equal(control.element.hidden, true);
    control.update(run({ phase: "failed" }));
    assert.equal(control.element.hidden, true);
  });
});

test("Take over sends the run's id, stays disabled until the run is held, then Hand back with the held sentence", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    const control = createHoldControl(relay(sent, accepted), () => true);
    const view = fake(control.element);
    const button = view.byClass("chat-hold")[0]!;
    control.update(run());
    button.dispatch("click");
    button.dispatch("click");
    await settle();
    assert.deepEqual(sent, [{ type: "fluxiq.panel.takeOverRun", projectId: "p", runId: "r1" }]);
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, "Taking over…");
    control.update(run({ sequence: 2, label: "Running step 2 of 5" }));
    assert.equal(button.textContent, "Taking over…", "still waiting for Core to hold the run");

    control.update(run({ sequence: 3, phase: "paused", label: "Paused: you have the page", step: { index: 3, count: 5, nodeId: "n3" } }));
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Hand back");
    const sentence = view.byClass("chat-hold-sentence")[0]!;
    assert.equal(sentence.hidden, false);
    assert.equal(sentence.textContent, "You have the page. FluxIQ continues from step 3 when you hand back.");

    button.dispatch("click");
    await settle();
    assert.deepEqual(sent[1], { type: "fluxiq.panel.handBackRun", projectId: "p", runId: "r1" });
    assert.equal(button.textContent, "Handing back…");
    assert.equal(button.disabled, true);
    control.update(run({ sequence: 4, phase: "running", label: "Continuing from step 3", step: { index: 3, count: 5 } }));
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Take over");
    assert.equal(sentence.hidden, true);
  });
});

test("a held run without a step says only that FluxIQ continues", async () => {
  await withFakeDocument(async () => {
    const control = createHoldControl(relay([], accepted), () => true);
    control.update(run({ phase: "paused", label: "Paused: you have the page" }));
    assert.equal(fake(control.element).byClass("chat-hold-sentence")[0]!.textContent, "You have the page. FluxIQ continues when you hand back.");
  });
});

test("a failed press says so in plain words and can be pressed again", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    let fail: "relay" | "core" | "throw" = "relay";
    const control = createHoldControl(relay(sent, async () => {
      if (fail === "throw") throw new Error("gone");
      return fail === "relay" ? { ok: false, sentence: "No answer" } : { ok: true, value: { ok: false, error: "x", code: "core_error" } };
    }), () => true);
    const view = fake(control.element);
    const button = view.byClass("chat-hold")[0]!;
    control.update(run());
    button.dispatch("click");
    await settle();
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Take over");
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, "Couldn't take over. Try again.");
    fail = "core";
    button.dispatch("click");
    await settle();
    assert.equal(sent.length, 2);
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, "Couldn't take over. Try again.");

    control.update(run({ sequence: 2, phase: "paused" }));
    fail = "throw";
    button.dispatch("click");
    await settle();
    assert.equal(button.textContent, "Hand back");
    assert.equal(button.disabled, false);
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, "Couldn't hand back. Try again.");
  });
});

test("an obsolete owner cannot press, and a reply for an older run or owner changes nothing", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    let eligible = false;
    let answer: (result: ChatResult<unknown>) => void = () => undefined;
    const control = createHoldControl(relay(sent, () => new Promise(resolve => { answer = resolve; })), () => eligible);
    const view = fake(control.element);
    const button = view.byClass("chat-hold")[0]!;
    control.update(run());
    assert.equal(control.element.hidden, true, "hidden for a chat that no longer owns the work");
    button.dispatch("click");
    assert.equal(sent.length, 0);

    eligible = true;
    control.update(run());
    button.dispatch("click");
    assert.equal(sent.length, 1);
    control.update(run({}, "r2"));
    answer({ ok: false, sentence: "late" });
    await settle();
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, "", "the older run's failure is not shown on the new run");
    assert.equal(button.textContent, "Take over");

    button.dispatch("click");
    assert.deepEqual(sent[1], { type: "fluxiq.panel.takeOverRun", projectId: "p", runId: "r2" });
    eligible = false;
    answer({ ok: false, sentence: "late" });
    await settle();
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, "", "an obsolete owner's failure changes nothing");
  });
});

test("a missing-task refusal offers recovery for the actual held run", async () => {
  await withFakeDocument(async () => {
    const sent: TestMessage[] = [];
    const control = createHoldControl(relay(sent, async () => ({ ok: false, code: "automation.instructions_required", sentence: "Author task instructions in FluxIQ before this automation can run or resume." })), () => true);
    control.update(run({ phase: "paused" }, "held-run"));
    const view = fake(control.element);
    view.byClass("chat-hold")[0]!.dispatch("click");
    await settle();
    const recovery = view.descendants().find((node) => node.tagName === "BUTTON" && node.textContent === "Open task Instructions in FluxIQ")!;
    assert.equal(recovery.hidden, false);
    recovery.dispatch("click");
    await settle();
    assert.deepEqual(sent[1], { type: "fluxiq.panel.openFluxIQ", runId: "held-run" });
  });
});

test("where the client cannot open instructions, the refusal shows its sentence and no recovery button", async () => {
  await withFakeDocument(async () => {
    const refusal = "Author task instructions in FluxIQ before this automation can run or resume.";
    const runs = runsOver(async () => ({ ok: false, code: "automation.instructions_required", sentence: refusal }), false);
    const control = createHoldControl(runs, () => true);
    control.update(run({ phase: "paused" }, "held-run"));
    const view = fake(control.element);
    view.byClass("chat-hold")[0]!.dispatch("click");
    await settle();
    assert.equal(view.byClass("chat-hold-status")[0]!.textContent, refusal);
    const recovery = view.descendants().find((node) => node.tagName === "BUTTON" && node.textContent === "Open task Instructions in FluxIQ")!;
    assert.equal(recovery.hidden, true);
  });
});
