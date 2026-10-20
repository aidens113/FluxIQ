// Coverage of pacer.ts: what the headline says and when it changes,
// the detail's pace (at most one change per interval, the newest always shown
// in the end), steps, and that settling events skip the wait.

import { expect, test } from "vitest";

import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { ACTIVITY_DETAIL_INTERVAL_MS, ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">, kind: "build" | "run" = "build", id = "b1"): ClientGatewayActivity {
  sequence += 1;
  return { activityId: `${kind}:${id}`, sequence, subject: { kind, id, projectId: "p" }, at: "2026-09-29T00:00:00.000Z", ...fields };
}

function harness() {
  const clock = new FakeClock(1_000);
  const shown: Array<{ at: number; display: ActivityDisplay }> = [];
  const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push({ at: clock.now(), display }) });
  return { clock, pacer, shown, details: () => shown.map((entry) => entry.display.detail) };
}

test("a build is headed 'Building your Flow' for as long as it works, whatever Core's phase says", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
  for (const [phase, label] of [["thinking", "Deciding the next step"], ["exploring", "Using core.run_node"], ["verifying", "Checking the proposed result"]] as const) {
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase, label }));
  }
  expect(new Set(h.shown.map((entry) => entry.display.headline))).toStrictEqual(new Set(["Building your Flow"]));
  // The decision being made holds "Reading your request" (U9), so it is not a change of its own.
  expect(h.details(), "in a person's words, never a tool id").toStrictEqual(["Reading your request", "Trying a step on the page", "Checking the Flow does what you asked"]);
  expect(h.pacer.display()?.working).toBe(true);
  expect(h.pacer.display()?.outcome).toBe(null);
});

test("headlines for every outcome of a build and a run", () => {
  const cases: Array<[ClientGatewayActivity, string, ActivityDisplay["outcome"], string | null]> = [
    [event({ phase: "done", label: "Build finished: a Flow is proposed", final: true }, "build", "x1"), "Flow ready", "done", "Build finished: a Flow is proposed"],
    [event({ phase: "failed", label: "Build failed", final: true }, "build", "x2"), "Build failed", "failed", null],
    [event({ phase: "running", label: "Run started" }, "run", "x3"), "Running your Flow", null, "Run started"],
    [event({ phase: "done", label: "Run finished", final: true }, "run", "x4"), "Run finished", "done", null],
    [event({ phase: "failed", label: "Run cancelled", final: true, stopped: true }, "run", "x5"), "Run stopped", "failed", "Run cancelled"],
    [event({ phase: "failed", label: "Build stopped", final: true, stopped: true }, "build", "x7"), "Build stopped", "failed", null],
    [event({ phase: "waiting_permission", label: "Run is waiting for an answer" }, "run", "x6"), TEST_HOST_WORDS.answer, "waiting", "Run is waiting for an answer"]
  ];
  for (const [input, headline, outcome, detail] of cases) {
    const h = harness();
    h.pacer.accept(input);
    expect(h.pacer.display()?.headline, input.label).toBe(headline);
    expect(h.pacer.display()?.outcome, input.label).toBe(outcome);
    expect(h.pacer.display()?.working, input.label).toBe(outcome === null);
    expect(h.pacer.display()?.detail, "Core's own sentence is kept when it is human, and dropped when it only repeats the headline").toBe(detail);
  }
});

test("the detail changes at most once per interval; the newest waiting sentence shows when it ends", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.inspect.succeeded" }));
  expect(h.details(), "nothing more inside the interval").toStrictEqual(["Reading your request"]);
  h.clock.advanceTo(1_000 + ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.details(), "latest wins, the ones in between are skipped").toStrictEqual(["Reading your request", "Looking at the page — done"]);
  expect(h.shown[1]!.at).toBe(1_000 + ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.pacer.display()?.phase, "the phase moves with the detail").toBe("exploring");
  expect(h.clock.pending(), "nothing is left waiting: no stale sentence stays up").toBe(0);
});

test("a sentence after a quiet interval shows at once", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Search”" }));
  expect(h.shown.length).toBe(2);
  expect(h.shown[1]!.at).toBe(6_000);
});

test("a repeated sentence is not a change and does not restart the interval", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  expect(h.shown.length).toBe(1);
  h.clock.advance(10);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node" }));
  expect(h.shown.length, "the interval still counts from the last real change").toBe(2);
});

test("final, failed and waiting events show at once and replace a waiting sentence", () => {
  for (const settle of [
    { phase: "done", label: "Build finished: a Flow is proposed", final: true },
    { phase: "failed", label: "Build failed: no list was found", final: true },
    { phase: "waiting_permission", label: "Waiting for an answer" }
  ] as const) {
    const h = harness();
    h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
    h.clock.advance(50);
    h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
    h.clock.advance(50);
    h.pacer.accept(event(settle));
    expect(h.shown.length, settle.phase).toBe(2);
    expect(h.shown[1]!.at, `${settle.phase} is not held back`).toBe(1_100);
    expect(h.shown[1]!.display.detail).toBe(settle.label);
    h.clock.advance(5_000);
    expect(h.shown.length, "the overtaken sentence never shows after it").toBe(2);
  }
});

test("a wait is headed in the words of the host whose pacer it is, and each host's words appear", () => {
  const extension = { answer: "Waiting for you: answer in the FluxIQ panel", check: "Waiting for you: finish the check on the page" };
  const panel = { answer: "Waiting for your answer", check: "Waiting for you: finish the check in your browser" };
  for (const words of [extension, panel]) {
    const clock = new FakeClock(1_000);
    const pacer = new ActivityPacer({ clock, hostWords: words, onChange: () => undefined });
    pacer.accept(event({ phase: "running", label: "Run started" }, "run", "w1"));
    pacer.accept(event({ phase: "waiting_permission", label: "Run is waiting for an answer" }, "run", "w1"));
    expect(pacer.display()?.headline).toBe(words.answer);
    pacer.accept(event({ phase: "building", label: "Reading your request" }, "build", "w2"));
    pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: { kind: "tool", title: "Using core.run_node", status: "succeeded", ref: "core.run_node", text: "Result: web.intervention.required" } }, "build", "w2"));
    expect(pacer.display()?.headline).toBe(words.check);
  }
});

test("work that resumes after waiting shows at once, headed as working again", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run"));
  h.clock.advance(1_300);
  h.pacer.accept(event({ phase: "waiting_permission", label: "Run is waiting for an answer" }, "run"));
  h.clock.advance(10);
  h.pacer.accept(event({ phase: "running", label: "Running step 3 of 4: Pay", step: { index: 3, count: 4 } }, "run"));
  expect(h.shown.map((entry) => entry.display.headline)).toStrictEqual(["Running your Flow", TEST_HOST_WORDS.answer, "Running your Flow"]);
});

test("a new unit of work shows at once with its own headline", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }, "build", "b1"));
  h.clock.advance(10);
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run", "r1"));
  expect(h.shown.map((entry) => [entry.display.activityId, entry.display.headline])).toStrictEqual([["build:b1", "Building your Flow"], ["run:r1", "Running your Flow"]]);
});

test("a run's step comes from its step events, is kept between them, and goes when the run settles", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run"));
  expect(h.pacer.display()?.step).toBe(null);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "running", label: "Running step 2 of 5: Open the cart", step: { index: 2, count: 5, nodeId: "n2" } }, "run"));
  expect(h.pacer.display()?.step).toStrictEqual({ index: 2, count: 5 });
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "extracting", label: "Stored 12 rows" }, "run"));
  expect(h.pacer.display()?.step, "an event without a step keeps the last one").toStrictEqual({ index: 2, count: 5 });
  h.pacer.accept(event({ phase: "done", label: "Run finished", final: true }, "run"));
  expect(h.pacer.display()?.step).toBe(null);
});

// U2 of t194 (`run-musp39u8-9ac026ab`, moments 22-34): the run's result was
// refuted after its 5 steps and a re-author repaired the Flow for four
// minutes, while the overlay and the panel said "Fixing your Flow · Step 5 of
// 5" the whole time. The re-author is not on any step of the run.
test("a run's step count does not outlive its steps into a repair of the Flow, and comes back with the re-run's steps", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 5 of 5: Reading the list", step: { index: 5, count: 5, nodeId: "n5" } }, "run"));
  expect(h.pacer.display()?.step).toStrictEqual({ index: 5, count: 5 });
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "verifying", label: "The result doesn't answer the request", detail: { kind: "check", title: "Result check", status: "failed" } }, "run"));
  expect(h.pacer.display()?.step, "the check is still about the run's own steps").toStrictEqual({ index: 5, count: 5 });
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 3)", detail: { kind: "step", title: "Result repair started", status: "started", ref: "n5" } }, "run"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.step], "at once, with the repair's own headline").toStrictEqual(["Fixing your Flow", null]);
  for (const [phase, label] of [["thinking", "Deciding the next step"], ["exploring", "Rerunning the search step (step 7) live"], ["verifying", "Checking the Flow does what you asked"]] as const) {
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase, label }, "run"));
    expect(h.pacer.display()?.step, `no step while the repair works: ${label}`).toBe(null);
  }
  expect(h.shown.slice(2).every((entry) => entry.display.step === null), "never shown, not even for one change").toBeTruthy();
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "running", label: "Running step 1 of 6: Opening the store", step: { index: 1, count: 6, nodeId: "m1" } }, "run"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.step], "the repaired Flow's re-run counts its own steps").toStrictEqual(["Running your Flow", { index: 1, count: 6 }]);
});

test("a run recovering from a failed step keeps that step's number", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5, nodeId: "n3" } }, "run"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Open the cart", detail: { kind: "step", title: "Open the cart", status: "failed", ref: "n3" } }, "run"));
  // Pressing the failed step again is still running the Flow (D12 of the t174 review, `run-retry.ts`).
  expect([h.pacer.display()?.headline, h.pacer.display()?.step]).toStrictEqual(["Running your Flow", { index: 3, count: 5 }]);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The cart link moved to the header.", status: "succeeded" } }, "run"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.step], "a repair of that one step is still on it").toStrictEqual(["Fixing your Flow", { index: 3, count: 5 }]);
});

test("fast steps are paced like any other sentence", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run"));
  for (let index = 1; index <= 10; index += 1) {
    h.clock.advance(100);
    h.pacer.accept(event({ phase: "running", label: `Running step ${index} of 10`, step: { index, count: 10 } }, "run"));
  }
  expect(h.shown.length, "ten steps in one second change nothing yet").toBe(1);
  h.clock.advanceTo(1_000 + ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.shown.length).toBe(2);
  expect(h.pacer.display()?.step).toStrictEqual({ index: 10, count: 10 });
});

test("whitespace is collapsed, an empty sentence reads as its phase, and a long one is bounded", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "repairing", label: "  Recovering from\n a failed   step " }));
  expect(h.pacer.display()?.detail).toBe("Recovering from a failed step");
  const h2 = harness();
  h2.pacer.accept(event({ phase: "repairing", label: "   " }));
  expect(h2.pacer.display()?.detail).toBe("Fixing a step that didn't work");
  const h3 = harness();
  h3.pacer.accept(event({ phase: "repairing", label: "x".repeat(400) }));
  expect(h3.pacer.display()?.detail?.length).toBe(160);
});

// U-4 of the run-muw60j7c-bb7c9a62 UI review: the status was cut inside a word.
test("a long sentence is bounded where a word ends, never inside one", () => {
  const h = harness();
  const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
  h.pacer.accept(event({ phase: "repairing", label: words }));
  const detail = h.pacer.display()!.detail!;
  expect(detail.length <= 160, detail).toBeTruthy();
  expect(detail.endsWith("…"), detail).toBeTruthy();
  expect(words.startsWith(`${detail.slice(0, -1)} `), `"${detail}" ends inside a word`).toBeTruthy();
});

test("no tool id or result code ever reaches the detail", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.action.rejected.not_at_start_location", detail: { kind: "tool", title: "Using core.run_node", status: "succeeded", ref: "core.run_node", text: "Result: web.action.rejected.not_at_start_location" } }));
  expect(h.pacer.display()?.detail).toBe("Trying a step on the page — not tried");
  expect(h.pacer.display()?.detail ?? "").not.toMatch(/\b[a-z]+\.[a-z_]+/u);
});

test("the display carries the newest sequence folded into it", () => {
  const h = harness();
  const first = event({ phase: "building", label: "Reading your request" });
  h.pacer.accept(first);
  expect(h.pacer.display()?.sequence).toBe(first.sequence);
});

test("the headline is never repeated as the detail", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Building the Flow" }));
  expect([h.pacer.display()?.headline, h.pacer.display()?.detail]).toStrictEqual(["Building your Flow", null]);
  h.pacer.accept(event({ phase: "done", label: "Run finished", final: true }, "run", "r9"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.detail]).toStrictEqual(["Run finished", null]);
  for (const entry of h.shown) expect(entry.display.detail?.toLowerCase()).not.toBe(entry.display.headline.toLowerCase());
});

test("a build's repair gets its own headline at once, keeps it while the repair works, and a build that fails in it says the build failed", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)" }));
  expect(h.shown.length, "not held back by the detail interval").toBe(2);
  expect(h.shown[1]!.display.headline).toBe("Fixing your Flow");
  expect(h.shown[1]!.display.working).toBe(true);
  for (const [phase, label] of [["thinking", "Deciding the next step"], ["exploring", "Using core.run_node"], ["building", "Amending the draft Flow"]] as const) {
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase, label }));
  }
  expect(new Set(h.shown.slice(1).map((entry) => entry.display.headline)), "distinct from building for the whole repair").toStrictEqual(new Set(["Fixing your Flow"]));
  h.pacer.accept(event({ phase: "failed", label: "Build failed", final: true }));
  // No Flow existed to fix: the build failed (t195 `run-musp474o-e0ed7432`, 12-failure-scenario).
  expect([h.pacer.display()?.headline, h.pacer.display()?.outcome]).toStrictEqual(["Build failed", "failed"]);
});

test("a run whose repair fails says it could not fix the Flow; one that only retried a step says the run failed", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5 } }, "run", "r9"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Open the cart" }, "run", "r9"));
  // Core working out a repair of the step, not only pressing it again (D12 of the t174 review).
  h.pacer.accept(event({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The cart link moved to the header.", status: "succeeded" } }, "run", "r9"));
  h.pacer.accept(event({ phase: "failed", label: "Run failed", final: true }, "run", "r9"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.outcome]).toStrictEqual(["Couldn't fix your Flow", "failed"]);
  const retried = harness();
  retried.pacer.accept(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5 } }, "run", "r10"));
  retried.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  retried.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Open the cart" }, "run", "r10"));
  retried.pacer.accept(event({ phase: "failed", label: "Run failed", final: true }, "run", "r10"));
  expect([retried.pacer.display()?.headline, retried.pacer.display()?.outcome], "nothing in the Flow was being fixed").toStrictEqual(["Run failed", "failed"]);
});

test("a run whose step is really being repaired is headed 'Fixing your Flow', and goes back to running at its next step", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5 } }, "run"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Open the cart" }, "run"));
  expect(h.pacer.display()?.headline, "a failed step alone is not a repair").toBe("Running your Flow");
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The cart link moved to the header.", status: "succeeded" } }, "run"));
  expect(h.pacer.display()?.headline, "Core repairing the step is").toBe("Fixing your Flow");
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5 } }, "run"));
  expect(h.pacer.display()?.headline).toBe("Running your Flow");
});

// D12 of the t174 UI review of run-musp8nz1-dbd3905a (moment 8): the page said
// it was busy, the run pressed again, and the overlay switched to "Fixing your
// Flow · Fixing a step that didn't work" while the chat rightly said "Trying the
// step again". Nothing in the Flow was being fixed.
test("a run retrying a step the page was too busy for stays 'Running your Flow' and says why it tries again", () => {
  const h = harness();
  const step = { index: 10, count: 12, nodeId: "n10", label: "Get coupons" };
  h.pacer.accept(event({ phase: "running", label: "Running step 10 of 12: Clicking “Get coupons”", step, detail: { kind: "step", title: "Clicking “Get coupons”", status: "started", ref: "n10" } }, "run"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Get coupons", detail: { kind: "step", title: "Clicking “Get coupons”", status: "failed", ref: "n10", text: "Result: web.action.rate_limited · Node: web.output.dom-click" } }, "run"));
  h.clock.advance(50);
  h.pacer.accept(event({ phase: "repairing", label: "Trying the step again", detail: { kind: "thought", title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more.", status: "succeeded", ref: "n10" } }, "run"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  const retrying = h.pacer.display()!;
  expect([retrying.headline, retrying.detail, retrying.step]).toStrictEqual(["Running your Flow", "The site asked FluxIQ to slow down, trying again", { index: 10, count: 12 }]);
  expect(h.shown.every((entry) => entry.display.headline === "Running your Flow"), h.shown.map((entry) => entry.display.headline).join(", ")).toBeTruthy();
  // A failure no code explains still reads as a retry, not a repair.
  const h2 = harness();
  h2.pacer.accept(event({ phase: "running", label: "Running step 2 of 3: Clicking “Next”", step: { index: 2, count: 3 } }, "run", "r2"));
  h2.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h2.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Next", detail: { kind: "step", title: "Step failed", status: "failed", ref: "n2" } }, "run", "r2"));
  // Until the ladder chooses to press it again, the line says only that it failed (t366).
  expect([h2.pacer.display()?.headline, h2.pacer.display()?.detail]).toStrictEqual(["Running your Flow", "That step didn't work"]);
  h2.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h2.pacer.accept(event({ phase: "repairing", label: "Trying the step again", detail: { kind: "thought", title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more.", status: "succeeded", ref: "n2" } }, "run", "r2"));
  expect([h2.pacer.display()?.headline, h2.pacer.display()?.detail]).toStrictEqual(["Running your Flow", "That step didn't work, trying again"]);
});

// D6 of the same review (00008, moments 3 and 6): the status said "clicking
// “Voltbay…” — done" while the next step's card was already working.
test("a step that finished well never leaves '— done' up: the status keeps naming the work until the next step replaces it", () => {
  const h = harness();
  const tool = (title: string, status: "started" | "succeeded", code?: string) =>
    event({ phase: "verifying", label: status === "succeeded" ? `${title} — done` : title, detail: { kind: "tool", title, status, ref: "core.run_node", ...(code ? { text: `Result: ${code}` } : {}) } });
  h.pacer.accept(tool("Trying the Flow from the start: clicking “Voltbay”", "started"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS + 100);
  h.pacer.accept(tool("Trying the Flow from the start: clicking “Voltbay”", "succeeded", "core.replay.replayed"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS + 100);
  h.pacer.accept(tool("Trying the Flow from the start: clicking “Reject non-essential”", "started"));
  h.clock.advance(5_000);
  for (const entry of h.shown) expect(entry.display.detail ?? "").not.toMatch(/— done$/u);
  expect(h.pacer.display()?.detail).toBe("Trying the Flow from the start: clicking “Reject non-essential”");
});

// D7 of the same review (moment 3, 00006): the status said "Deciding the next
// step" while the step the decision chose already had its card working.
test("a step that starts after the decision shows at once, never 'Deciding the next step' beside its working card", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }));
  h.clock.advance(300);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Get coupons”", detail: { kind: "tool", title: "Clicking “Get coupons”", status: "started", ref: "core.run_node" } }));
  expect(h.pacer.display()?.detail).toBe("Clicking “Get coupons”");
  expect(h.shown.at(-1)?.at, "not held back by the pace").toBe(1_300);
});

// D7: the overlay held each line for its own 1.6 s dwell on top of this pace,
// so it lagged the panel's status row, which draws the display as it comes.
// One pace for both: any three seconds show at most two paced changes.
test("any three seconds of steady work show at most two changes, the guarantee the overlay used to add on its own", () => {
  const h = harness();
  for (let index = 0; index < 60; index += 1) {
    h.pacer.accept(event({ phase: index % 2 ? "thinking" : "exploring", label: `Sentence ${index + 1}` }));
    h.clock.advance(100);
  }
  const times = h.shown.map((entry) => entry.at);
  for (const [index, at] of times.entries()) {
    const inWindow = times.filter((other) => other > at && other <= at + 3_000).length;
    expect(inWindow <= 2, `${inWindow + 1} changes within 3 s from ${at} ms: ${times.join(", ")}`).toBeTruthy();
    if (index > 0) expect(at - times[index - 1]! >= 1_500, `${at - times[index - 1]!} ms between two changes`).toBeTruthy();
  }
});

test("a page that only a person can get past: the headline says so plainly, until the page lets FluxIQ through", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Reading your request" }));
  h.clock.advance(100);
  const check = { kind: "tool" as const, title: "Using core.run_node", status: "succeeded" as const, ref: "core.run_node", text: "Result: web.intervention.required" };
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: check }));
  expect(h.shown.length, "at once").toBe(2);
  expect([h.pacer.display()?.headline, h.pacer.display()?.detail, h.pacer.display()?.outcome, h.pacer.display()?.working]).toStrictEqual([TEST_HOST_WORDS.check, "Only a person can get past this page", "waiting", false]);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.action.rejected.not_found", detail: { ...check, text: "Result: web.action.rejected.not_found" } }));
  expect(h.pacer.display()?.headline, "still waiting while Core keeps deciding").toBe(TEST_HOST_WORDS.check);
  expect(h.shown.length, "and paced like any detail: the second sentence waits for the interval").toBe(3);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.inspect.succeeded", detail: { ...check, text: "Result: web.inspect.succeeded" } }));
  expect([h.pacer.display()?.headline, h.pacer.display()?.outcome], "the page let FluxIQ through").toStrictEqual(["Building your Flow", null]);
});

test("Core's person-needed ask at a robot check shows at once, whole, as the waiting display's sentence", () => {
  const ask = "FluxIQ needs you: complete the check on this page, then press Continue.";
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "waiting_permission", label: ask }));
  const shown = h.shown.at(-1);
  expect(shown?.at, "inside the detail interval, and still shown at once").toBe(1_100);
  expect([shown?.display.headline, shown?.display.detail, shown?.display.outcome, shown?.display.working], "Continue and Stop are pressed in the panel").toStrictEqual([TEST_HOST_WORDS.answer, ask, "waiting", false]);
});

// A model provider outage (live run `run-muq05kas-058193f0`): the live line said
// "Thinking about the next step" for as long as anyone watched. Core now ends
// the build after three unanswered requests; its final event stops the line.
test("a build stopped by a provider outage stops working at once and says why", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(45_000);
  h.pacer.accept(event({ phase: "thinking", label: "The AI model provider did not answer" }));
  h.clock.advance(45_000);
  h.pacer.accept(event({ phase: "failed", label: "Build stopped: the AI model provider is not responding", final: true }));
  const last = h.shown.at(-1)!;
  expect(last.at).toBe(91_000);
  expect(last.display.detail).toBe("Build stopped: the AI model provider is not responding");
  expect(last.display.outcome).toBe("failed");
  expect(last.display.working).toBe(false);
});

// D7 of the t174 UI review of run-murwd8le-79e735a8: after the person pressed
// Continue on the robot check, the overlay still said "Waiting for you", and
// the status repeated the answer ("You pressed Continue.") that the thread's
// card and the ask already said.
test("the person answers the check: the waiting headline goes at once, and the answer is not echoed as the status", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  h.clock.advance(100);
  const check = { kind: "tool" as const, title: "Using core.run_node", status: "succeeded" as const, ref: "core.run_node", text: "Result: web.intervention.required" };
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: check }));
  h.clock.advance(100);
  const ask = "FluxIQ needs you: complete the check on this page, then press Continue.";
  h.pacer.accept(event({ phase: "waiting_permission", label: ask, detail: { kind: "ask", title: "Robot check", status: "started", ref: "ask-1" } }));
  expect(h.pacer.display()?.outcome).toBe("waiting");
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "repairing", label: "You pressed Continue.", detail: { kind: "ask", title: "Robot check", text: "You pressed Continue.", status: "succeeded", ref: "ask-1", resolution: "answered" } }));
  const answered = h.shown.at(-1)!;
  expect(answered.at, "at once, inside the detail interval").toBe(1_300);
  expect([answered.display.outcome, answered.display.working, answered.display.headline], "working again, not waiting").toStrictEqual([null, true, "Fixing your Flow"]);
  expect(answered.display.detail, "the answer is said once, by the thread, not again as the status").toBe(null);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step" }));
  expect([h.pacer.display()?.headline, h.pacer.display()?.outcome], "the check the person completed no longer holds the headline").toStrictEqual(["Fixing your Flow", null]);
});

// D10 (step 0068): the chat already said "Judging the Flow" while the status
// still said the last dry-run step "— done".
test("a new stage Core announces replaces a finished step's sentence at once", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "verifying", label: "Trying the Flow from the start: clicking “Add to cart”", detail: { kind: "tool", title: "Trying the Flow from the start: clicking “Add to cart”", status: "started", ref: "core.run_node" } }));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS + 500);
  h.pacer.accept(event({ phase: "verifying", label: "Trying the Flow from the start: clicking “Add to cart” — done", detail: { kind: "tool", title: "Trying the Flow from the start: clicking “Add to cart”", status: "succeeded", ref: "core.run_node", text: "Result: core.replay.replayed" } }));
  h.clock.advance(10);
  h.pacer.accept(event({ phase: "verifying", label: "Judging the Flow", detail: { kind: "note", title: "Judging the Flow", text: "The Flow was tested from its start. Judging what the test did against what you asked." } }));
  expect(h.pacer.display()?.detail, "the newest stage, not the step that finished before it").toBe("Judging the Flow");
});

// D10 (screenshot 00015): during the cross-check after a passed result check
// the overlay still said "Fixing your Flow".
test("a repaired build whose result check passes is no longer headed as a repair", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)" }));
  expect(h.pacer.display()?.headline).toBe("Fixing your Flow");
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "verifying", label: "The result answers the request", detail: { kind: "check", title: "Result check", status: "succeeded", text: "The model judged that the result answers the request." } }));
  expect(h.pacer.display()?.headline).toBe("Building your Flow");
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(event({ phase: "verifying", label: "Couldn't confirm the result answers the request", detail: { kind: "check", title: "Result check", status: "failed" } }));
  expect(h.pacer.display()?.headline, "a failed check alone does not start a repair; Core's repairing event does").toBe("Building your Flow");
});

// t276 item 3, U4 of run-muw60unq-591e23bd: a creation build's overlay ended "Couldn't fix your
// Flow · Build stopped: the Flow is not finished yet". "Couldn't fix" belongs to a run's failed
// repair; a row that says the build stopped, failed or was not doable ends a build, whatever
// unit of work it arrived in.
test("a settling row in Core's words for a build's ending heads the status as the build's failure, never as a failed repair", () => {
  for (const title of ["Build stopped: the Flow is not finished yet", "Not doable: this Flow could not be built", "Build failed"]) {
    const h = harness();
    h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)", detail: { kind: "step", title: "Result repair started", status: "started" } }, "run", "r7"));
    h.pacer.accept(event({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The variant is still China.", status: "succeeded" } }, "run", "r7"));
    expect(h.pacer.display()?.headline).toBe("Fixing your Flow");
    h.pacer.accept(event({ phase: "failed", label: title, final: true, detail: { kind: "step", title, status: "failed" } }, "run", "r7"));
    expect([h.pacer.display()?.headline, h.pacer.display()?.outcome], title).toStrictEqual(["Build failed", "failed"]);
  }
  // A run's own ending still reads as the failed repair it was.
  const run = harness();
  run.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)", detail: { kind: "step", title: "Result repair started", status: "started" } }, "run", "r8"));
  run.pacer.accept(event({ phase: "failed", label: "Run failed", final: true, detail: { kind: "step", title: "Run failed", status: "failed" } }, "run", "r8"));
  expect(run.pacer.display()?.headline).toBe("Couldn't fix your Flow");
});

// W27 of the week review, run-mux74k5q-1c3c2127 (last two moments): a creation build's overlay
// still ended "Couldn't fix your Flow | Build stopped: a budget ran out" after the guard above.
// A row after the build's ending in the same unit -- a model thought keeps the action line --
// took its headline from the event's subject again. The unit keeps the kind its ending named.
test("rows after a build's ending in the same unit keep the build's failure as the headline", () => {
  for (const phase of ["failed", "thinking"] as const) {
    const h = harness();
    h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)", detail: { kind: "step", title: "Result repair started", status: "started" } }, "run", "r9"));
    const title = "Build stopped: a budget ran out";
    h.pacer.accept(event({ phase: "failed", label: title, final: true, detail: { kind: "step", title, status: "failed" } }, "run", "r9"));
    expect(h.pacer.display()?.headline).toBe("Build failed");
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase, label: "I'll re-read the page", detail: { kind: "thought", title: "Re-reading the page", text: "I'll re-read the page to find the quantity field.", status: "succeeded" } }, "run", "r9"));
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    expect(h.pacer.display()?.headline, phase).not.toBe("Couldn't fix your Flow");
    expect(h.shown.every((entry) => entry.display.headline !== "Couldn't fix your Flow"), `${phase}: ${JSON.stringify(h.shown.map((entry) => entry.display.headline))}`).toBeTruthy();
  }
});

// Lane A round 4, run-muxkzdjw-31a13429 (moments 15-16): a creation build that stopped on its call
// allowance after two repair rounds still ended on "Couldn't fix your Flow | Build stopped: a budget
// ran out". The Lab keeps no record of the events the extension received, so the row's exact shape is
// not established; these are the two ways the build's own ending sentence can still sit under a run's
// failed-repair headline.
test("a settling row whose words end the build heads the build's failure, whatever kind of row carries them", () => {
  const title = "Build stopped: a budget ran out";
  for (const detail of [undefined, { kind: "note" as const, title, status: "failed" as const }, { kind: "thought" as const, title, text: title, status: "failed" as const }]) {
    const h = harness();
    h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)", detail: { kind: "step", title: "Result repair started", status: "started" } }, "run", "r11"));
    h.pacer.accept(event({ phase: "failed", label: title, final: true, ...(detail ? { detail } : {}) }, "run", "r11"));
    expect([h.pacer.display()?.headline, h.pacer.display()?.outcome], detail?.kind ?? "no detail").toStrictEqual(["Build failed", "failed"]);
  }
});

test("a unit that settled stays settled: a later row in it does not reopen the work", () => {
  for (const kind of ["build", "run"] as const) {
    const h = harness();
    h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow", detail: { kind: "note", title: "Repairing the Flow", status: "started", text: "Repairing it live." } }, kind, "u1"));
    const title = "Build stopped: a budget ran out";
    h.pacer.accept(event({ phase: "failed", label: title, final: true, detail: { kind: "step", title, status: "failed" } }, kind, "u1"));
    const settledAt = h.shown.length;
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase: "thinking", label: "I will set the quantity", detail: { kind: "thought", title: "Deciding", text: "I will set the quantity to 3.", status: "succeeded" } }, kind, "u1"));
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(event({ phase: "exploring", label: "Clicking “+”", detail: { kind: "tool", title: "Clicking “+”", status: "started" } }, kind, "u1"));
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    expect([h.pacer.display()?.headline, h.pacer.display()?.outcome, h.pacer.display()?.detail], kind).toStrictEqual(["Build failed", "failed", title]);
    const after = h.shown.slice(settledAt - 1).map((entry) => [entry.display.headline, entry.display.outcome]);
    expect(after.every(([headline, outcome]) => headline === "Build failed" && outcome === "failed"), `${kind}: ${JSON.stringify(after)}`).toBeTruthy();
  }
});

// U3 of t194: the overlay said "Couldn't fix your Flow | Run failed" and
// nothing more. Core's last row now says what came back and why; the status
// shows it whole, as the chat does.
test("a failed run's status says what came back and why it failed, beside the repair's headline", () => {
  const h = harness();
  const sentence = "It returned 13 rows, but the check found they don't answer what you asked, and the fix ran out of room before it finished.";
  h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 3)", detail: { kind: "step", title: "Result repair started", status: "started" } }, "run"));
  h.pacer.accept(event({ phase: "failed", label: `Run failed: ${sentence}`, final: true, detail: { kind: "step", title: "Run failed", status: "failed", text: sentence } }, "run"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.detail, h.pacer.display()?.outcome]).toStrictEqual(["Couldn't fix your Flow", `Run failed: ${sentence}`, "failed"]);
});

// U9 of the run-musp39u8-9ac026ab UI review (moments 7, 27, 28): through a
// re-author the status alternated about once a second between "Deciding the
// next step" and the model's one-line summary of its last decision. Each
// decision opens with a reasonless "Deciding the next step" row and closes
// with its reason, so a pacer showing both flashed between them for minutes.
// The last meaningful line is held while the next decision is made. Core says
// the reason as a thought titled with what the model chose (Core's
// `runtime/activity/observer.ts`): the model's words, which the chat tells and
// the status never shows (D6 of the run-musp4h2f-72e8ed99 review).
const deciding = (kind: "build" | "run" = "build") => event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }, kind);
const decided = (title: string, text: string, kind: "build" | "run" = "build") => event({ phase: "building", label: title, detail: { kind: "thought", title, text, status: "succeeded" } }, kind);
const stepStarts = (title: string, kind: "build" | "run" = "build") => event({ phase: "exploring", label: title, detail: { kind: "tool", title, status: "started", ref: "core.run_node" } }, kind);

test("U9: a decision being made holds the last meaningful line instead of flashing 'Deciding the next step'", () => {
  const h = harness();
  const repair = "Repairing the Flow: the result check refuted its answer (attempt 1 of 3)";
  h.pacer.accept(event({ phase: "repairing", label: repair, detail: { kind: "step", title: "Result repair started", status: "started" } }, "run"));
  const first = "Adding the search-results listing step with filters, then a repeat to read every page.";
  const second = "Rerunning the search step live so the Flow reaches the results page.";
  for (const [title, text] of [["Amending the draft Flow", first], ["Clicking “Search”", second], ["Amending the draft Flow", first]] as const) {
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(deciding("run"));
    expect(h.pacer.display()?.detail).toBe(h.shown.at(-1)!.display.detail);
    expect(h.pacer.display()?.detail, "held while the next decision is made").not.toBe("Deciding the next step");
    h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    h.pacer.accept(decided(title, text, "run"));
    if (title.startsWith("Clicking")) {
      h.clock.advance(100);
      h.pacer.accept(stepStarts(title, "run"));
    }
  }
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(deciding("run"));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.details(), "the stage, then the step it ran, held through every decision: never the flash, never the model's reasons").toStrictEqual([repair, "Clicking “Search”"]);
  expect(h.shown.every((entry) => entry.display.headline === "Fixing your Flow")).toBeTruthy();
});

test("U9: 'Deciding the next step' shows when nothing meaningful is up, and never overtakes a line still waiting for its turn", () => {
  const h = harness();
  h.pacer.accept(deciding());
  expect(h.pacer.display()?.detail, "the first line of a unit says what it is doing").toBe("Deciding the next step");
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  h.pacer.accept(stepStarts("Clicking “Search”"));
  h.clock.advance(100);
  h.pacer.accept(stepStarts("Clicking “Next page”"));
  h.clock.advance(100);
  h.pacer.accept(decided("Reading the list", "Reading the results list next."));
  h.clock.advance(100);
  h.pacer.accept(deciding());
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.details(), "the waiting line still reaches the screen, and the reason never does").toStrictEqual(["Deciding the next step", "Clicking “Search”", "Clicking “Next page”"]);
});

// D6 and D13 of the run-musp4h2f-72e8ed99 UI review: the status showed a
// refused edit's prose and the model's reason for its next press, and a
// thought counted as a change of the detail, so the action after it waited up
// to an interval. A thought is said in the chat; the status keeps the action.
const reasonRow = (text: string, title = "Clicking “Set as my store”") => ({ kind: "thought" as const, title, text, status: "succeeded" as const });

test("a model's thought or refusal is never the detail, and does not count as a change of it", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Change store”", detail: { kind: "tool", title: "Clicking “Change store”", status: "started", ref: "core.run_node" } }));
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS + 300);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Set as my store”", detail: reasonRow("Store chooser is open; I'll press “Set as my store” for Millbrook.") }));
  h.clock.advance(50);
  h.pacer.accept(event({ phase: "building", label: "Didn't change the Flow", detail: reasonRow("That step has no such value to make vary; so this was not done: adding the pape…", "Didn't change the Flow") }));
  expect(h.pacer.display()?.detail, "the action line stays").toBe("Clicking “Change store”");
  expect(h.pacer.display()?.kind, "the display says its newest event was a thought").toBe("thought");
  expect(h.details().every((detail) => !/Store chooser|no such value/u.test(detail ?? "")), `no prose ever shown: ${JSON.stringify(h.details())}`).toBeTruthy();
  h.clock.advance(50);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Set as my store”", detail: { kind: "tool", title: "Clicking “Set as my store”", status: "started", ref: "core.run_node" } }));
  expect(h.shown.at(-1)?.display.detail, "the action shows at once: the thoughts did not restart the interval").toBe("Clicking “Set as my store”");
  expect(h.shown.at(-1)?.at).toBe(1_000 + ACTIVITY_DETAIL_INTERVAL_MS + 400);
  expect(h.pacer.display()?.kind).toBe("action");
});

test("a thought while an action waits for the interval leaves that action waiting, and it still shows", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “A”" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “B”" }));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “C”", detail: reasonRow("Because C is next.", "Clicking “C”") }));
  h.clock.advanceTo(1_000 + ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.details()).toStrictEqual(["Clicking “A”", "Clicking “B”"]);
});

test("a unit of work whose first event is a thought shows its headline with no detail; Core's deciding row is still the action", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "thinking", label: "Clicking “Go”", detail: reasonRow("The form is behind it.", "Clicking “Go”") }, "build", "fresh"));
  expect([h.pacer.display()?.headline, h.pacer.display()?.detail, h.pacer.display()?.working]).toStrictEqual(["Building your Flow", null, true]);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  const outage = "The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering.";
  h.pacer.accept(event({ phase: "thinking", label: "The AI model provider did not answer", detail: { kind: "thought", title: "Deciding the next step", status: "failed", text: outage } }, "build", "fresh"));
  expect(h.pacer.display()?.detail, "Core's own sentence about its deciding row is status").toBe(outage);
});

// t376: a stopped ending is read from Core's `stopped` field, never from its words.
test("a stopped ending comes from Core's stopped field, not from the label", () => {
  const stopped = harness();
  stopped.pacer.accept(event({ phase: "running", label: "Run started" }, "run", "s1"));
  stopped.pacer.accept(event({ phase: "failed", label: "Run ended early", final: true, stopped: true }, "run", "s1"));
  expect(stopped.pacer.display()?.headline).toBe("Run stopped");
  const build = harness();
  build.pacer.accept(event({ phase: "failed", label: "Build ended early", final: true, stopped: true }, "build", "s2"));
  expect(build.pacer.display()?.headline).toBe("Build stopped");
  for (const [label, kind, headline] of [["Run cancelled", "run", "Run failed"], ["Build stopped", "build", "Build failed"]] as const) {
    const h = harness();
    h.pacer.accept(event({ phase: "failed", label, final: true }, kind, "s3"));
    expect(h.pacer.display()?.headline, `${label} without the field is not a stop`).toBe(headline);
  }
});

test("a run held for the person shows 'Paused: your turn on the page' at once, keeps its step, and clears when it continues", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 2 of 4: Open search", step: { index: 2, count: 4, nodeId: "n2" } }, "run", "p1"));
  h.clock.advance(100);
  h.pacer.accept(event({ phase: "paused", label: "Paused: you have the page", step: { index: 3, count: 4, nodeId: "n3" } }, "run", "p1"));
  const paused = h.shown.at(-1)!;
  expect(paused.at, "shown at once, inside the interval").toBe(1_100);
  expect(paused.display.headline).toBe("Paused: your turn on the page");
  expect(paused.display.outcome).toBe("waiting");
  expect(paused.display.working).toBe(false);
  expect(paused.display.phase).toBe("paused");
  expect(paused.display.detail, "Core's label only repeats the headline").toBe(null);
  expect(paused.display.step, "the step it continues from").toStrictEqual({ index: 3, count: 4 });
  const count = h.shown.length;
  h.clock.advance(60_000);
  expect(h.shown.length, "nothing changes on its own while held: no fade, no timer").toBe(count);
  h.pacer.accept(event({ phase: "running", label: "Continuing from step 3", step: { index: 3, count: 4, nodeId: "n3" } }, "run", "p1"));
  const resumed = h.pacer.display()!;
  expect(resumed.headline).toBe("Running your Flow");
  expect(resumed.outcome).toBe(null);
  expect(resumed.working).toBe(true);
  expect(h.shown.at(-1)!.at, "the continuation shows at once").toBe(61_100);
});

test("a held run that is stopped ends 'Run stopped'; a plain pause reads the same paused headline", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "paused", label: "Paused" }, "run", "p2"));
  expect(h.pacer.display()?.headline).toBe("Paused: your turn on the page");
  h.pacer.accept(event({ phase: "failed", label: "Run cancelled", final: true, stopped: true }, "run", "p2"));
  expect(h.pacer.display()?.headline).toBe("Run stopped");
  expect(h.pacer.display()?.outcome).toBe("failed");
});

test("a check on the page ends when the held run continues, even from a step with no number", () => {
  const h = harness();
  const check = { kind: "tool" as const, title: "Using core.run_node", status: "succeeded" as const, ref: "core.run_node", text: "Result: web.intervention.required" };
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run", "p3"));
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: check }, "run", "p3"));
  expect(h.pacer.display()?.outcome).toBe("waiting");
  h.pacer.accept(event({ phase: "paused", label: "Paused: you have the page" }, "run", "p3"));
  expect(h.pacer.display()?.headline, "the hold outweighs the check").toBe("Paused: your turn on the page");
  h.pacer.accept(event({ phase: "running", label: "Continuing the run" }, "run", "p3"));
  expect(h.pacer.display()?.outcome).toBe(null);
  expect(h.pacer.display()?.headline).toBe("Running your Flow");
});
