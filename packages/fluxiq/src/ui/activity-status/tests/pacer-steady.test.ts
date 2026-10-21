// Coverage of pacer.ts for a status line that is stable and true (t753): it
// changes only when the work's state changes, never repeats its headline,
// never stutters a cause, never reads a site's reset or a page being got
// ready as a repair or a test, keeps one step count through a run, and never
// shows a refusal or an after-the-fact wait as news.

import { expect, test } from "vitest";

import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { ACTIVITY_DETAIL_INTERVAL_MS, ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">, kind: "build" | "run" = "build", id = "b1"): ClientGatewayActivity {
  sequence += 1;
  return { activityId: `${kind}:${id}`, sequence, subject: { kind, id, projectId: "p" }, at: "2026-10-20T00:00:00.000Z", ...fields };
}

function harness() {
  const clock = new FakeClock(1_000);
  const shown: Array<{ at: number; display: ActivityDisplay }> = [];
  const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push({ at: clock.now(), display }) });
  return { clock, pacer, shown, headlines: () => shown.map((entry) => entry.display.headline) };
}

/** The most changes any window of `windowMs` holds. */
function busiestWindow(shown: ReadonlyArray<{ at: number }>, windowMs: number): number {
  let most = 0;
  for (const entry of shown) most = Math.max(most, shown.filter((other) => other.at >= entry.at && other.at < entry.at + windowMs).length);
  return most;
}

const builder = (briefId: string): NonNullable<ClientGatewayActivity["agent"]> => ({ role: "builder", briefId, subflowName: `Part ${briefId}` });
const supervisor: NonNullable<ClientGatewayActivity["agent"]> = { role: "supervisor" };

function briefCard(briefId: string, brief: "build" | "reset" | "repair"): Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label"> {
  return {
    phase: "building",
    label: `Brief ${briefId}`,
    agent: supervisor,
    detail: { kind: "note", title: `Brief ${briefId}`, project: { kind: "brief", briefId, brief, subflowKey: `part-${briefId}`, subflowName: `Part ${briefId}`, purpose: "a part of the Flow", allowanceUsd: 0.05 } }
  };
}

test("a failed build's detail never repeats its headline, and a cause that repeats itself is said once", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Building the Flow" }));
  const said = "Build failed: FluxIQ could not finish the Flow: I could not finish this.";
  h.pacer.accept(event({ phase: "failed", final: true, label: said, detail: { kind: "step", title: said, status: "failed", text: "FluxIQ could not finish the Flow: I could not finish this." } }));
  expect(h.pacer.display()?.headline).toBe("Build failed");
  expect(h.pacer.display()?.detail).toBe("FluxIQ could not finish the Flow.");
  for (const [label, detail] of [["The build failed: no list was found", "No list was found"], ["Build failed", null]] as const) {
    const other = harness();
    other.pacer.accept(event({ phase: "failed", final: true, label }, "build", label));
    expect(other.pacer.display()?.detail, label).toBe(detail);
  }
});

test("a new brief ends a repair: a reset reads as putting the site back, a build as building", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Building the Flow" }));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer", agent: builder("b-1") }));
  h.clock.advance(5_000);
  expect(h.pacer.display()?.headline).toBe("Fixing your Flow");
  h.pacer.accept(event(briefCard("b-2", "reset")));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node", agent: builder("b-2"), detail: { kind: "tool", title: "Clicking “Remove”", status: "started", ref: "core.run_node" } }));
  h.clock.advance(5_000);
  expect(h.pacer.display()?.headline).toBe("Putting the site back");
  h.pacer.accept(event(briefCard("b-3", "build")));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node", agent: builder("b-3"), detail: { kind: "tool", title: "Clicking “Search”", status: "started", ref: "core.run_node" } }));
  h.clock.advance(5_000);
  expect(h.pacer.display()?.headline).toBe("Building your Flow");
});

test("getting the page ready before a test is neither a test nor a repair, and shows no step count", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Building the Flow" }));
  const ready = (index: number, count: number, action: string) => event({ phase: "running", label: `Getting the page ready: ${action}`, step: { index, count, nodeId: `n${index}` }, detail: { kind: "step", title: action, status: "started", ref: `n${index}` } });
  h.clock.advance(5_000);
  h.pacer.accept(ready(1, 3, "Opening the start page"));
  expect(h.pacer.display()).toMatchObject({ headline: "Getting the page ready", step: null, detail: "Opening the start page" });
  h.clock.advance(5_000);
  h.pacer.accept(ready(2, 5, "Clicking “Go”"));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "repairing", label: "Recovering from a failed step: Clicking “Go”", detail: { kind: "step", title: "Clicking “Go”", status: "failed", ref: "n2" } }));
  h.clock.advance(5_000);
  expect(h.shown.map((entry) => entry.display.step).filter((step) => step !== null), "no count while the page is got ready").toEqual([]);
  expect(h.headlines()).not.toContain("Testing your Flow");
  expect(h.headlines()).not.toContain("Fixing your Flow");
  h.pacer.accept(event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }));
  h.clock.advance(5_000);
  expect(h.pacer.display()?.headline).toBe("Building your Flow");
});

test("a run's step count never jumps: a part's own steps keep the run's count", () => {
  const h = harness();
  const step = (index: number, count: number, action: string) => event({ phase: "running", label: `Running step ${index} of ${count}: ${action}`, step: { index, count, nodeId: `${count}-${index}` }, detail: { kind: "step", title: action, status: "started", ref: `${count}-${index}` } }, "run", "r1");
  h.pacer.accept(event({ phase: "running", label: "Run started" }, "run", "r1"));
  for (const [index, count, action] of [[1, 3, "Opening the start page"], [2, 3, "Searching"], [1, 5, "Typing “shoes”"], [2, 5, "Clicking “Go”"], [3, 3, "Reading the list"]] as const) {
    h.clock.advance(5_000);
    h.pacer.accept(step(index, count, action));
  }
  const counts = h.shown.map((entry) => entry.display.step?.count).filter((count) => count !== undefined);
  expect(new Set(counts)).toStrictEqual(new Set([3]));
  const indices = h.shown.map((entry) => entry.display.step?.index).filter((index) => index !== undefined);
  expect(indices.filter((index, at) => index !== indices[at - 1]), "the part's steps leave the run on the step that called it").toEqual([1, 2, 3]);
  expect(h.shown.some((entry) => /step \d+ of 5/u.test(entry.display.detail ?? "")), "the part's own numbering is not said either").toBe(false);
  expect(h.shown.map((entry) => entry.display.detail)).toContain("Clicking “Go”");
});

test("two agents working at once do not make the line flicker: it follows one until it goes quiet", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "building", label: "Building the Flow" }));
  for (let tick = 0; tick < 30; tick += 1) {
    h.clock.advance(400);
    if (tick % 2 === 0) h.pacer.accept(event({ phase: "running", label: `Running step ${(tick % 4) + 1} of 4: Clicking “Item ${tick}”`, step: { index: (tick % 4) + 1, count: 4 }, agent: builder("b-1"), detail: { kind: "step", title: `Clicking “Item ${tick}”`, status: "started" } }));
    else h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node", agent: builder("b-2"), detail: { kind: "tool", title: `Clicking “Other ${tick}”`, status: "started", ref: "core.run_node" } }));
  }
  h.clock.advance(10_000);
  expect(busiestWindow(h.shown, 3_000), "at most two changes in any three seconds").toBeLessThanOrEqual(2);
  const headlineChanges = h.headlines().filter((headline, index, all) => index > 0 && headline !== all[index - 1]).length;
  expect(headlineChanges, "the headline does not alternate between the agents").toBeLessThanOrEqual(2);
});

test("a new stage and a new headline wait their turn; a headline stays up for its dwell", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Opening the page" }));
  h.clock.advance(200);
  h.pacer.accept(event({ phase: "verifying", label: "Judging the Flow", detail: { kind: "note", title: "Judging the Flow" } }));
  expect(h.shown.length, "a stage does not skip the pace").toBe(1);
  h.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
  expect(h.pacer.display()?.detail).toBe("Judging the Flow");
  const h2 = harness();
  h2.pacer.accept(event({ phase: "exploring", label: "Opening the page" }, "build", "b2"));
  h2.clock.advance(ACTIVITY_DETAIL_INTERVAL_MS + 100);
  h2.pacer.accept(event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer" }, "build", "b2"));
  expect(h2.shown.length, "the first headline has not had its dwell").toBe(1);
  h2.clock.advance(5_000);
  expect(h2.pacer.display()?.headline).toBe("Fixing your Flow");
  expect(h2.shown[1]!.at - h2.shown[0]!.at).toBeGreaterThanOrEqual(3_000);
});

test("a change that returns to what is shown before its turn shows nothing", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Opening the page" }));
  h.clock.advance(200);
  h.pacer.accept(event({ phase: "exploring", label: "Clicking “Search”" }));
  h.clock.advance(200);
  h.pacer.accept(event({ phase: "exploring", label: "Opening the page" }));
  h.clock.advance(5_000);
  expect(h.shown.map((entry) => entry.display.detail)).toEqual(["Opening the page"]);
});

test("a guard's refusal is never the status line: the card says it", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "exploring", label: "Using core.run_node", detail: { kind: "tool", title: "Opening “Listings”", status: "started", ref: "core.run_node" } }));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "building", label: "Not done: opening “Listings”", detail: { kind: "tool", title: "Opening “Listings”", status: "failed", ref: "core.run_node", text: "Result: llm_evidence_loop.repeat_refused · Reason: failed" } }));
  h.clock.advance(5_000);
  for (const entry of h.shown) expect(entry.display.detail ?? "").not.toMatch(/not done|already tried/iu);
});

test("a check that cleared before anyone was asked changes nothing on the line", () => {
  const h = harness();
  h.pacer.accept(event({ phase: "running", label: "Running step 2 of 4: Clicking “Next”", step: { index: 2, count: 4 } }, "run", "r2"));
  h.clock.advance(5_000);
  h.pacer.accept(event({ phase: "waiting_permission", label: "Waiting for a check on the page to clear", detail: { kind: "ask", title: "Waited for a check to clear", status: "started", ref: "w1" } }, "run", "r2"));
  h.pacer.accept(event({ phase: "running", label: "The check cleared on its own after 10 s.", detail: { kind: "ask", title: "Waited for a check to clear", status: "succeeded", ref: "w1", resolution: "waited_out", text: "The check cleared on its own after 10 s." } }, "run", "r2"));
  h.clock.advance(5_000);
  expect(h.shown.length).toBe(1);
  expect(h.pacer.display()?.detail).toBe("Running step 2 of 4: Clicking “Next”");
});

test("a detail Core cut inside a word is shown cut where a word ends", () => {
  const h = harness();
  const whole = "Typing the delivery address into the form because the address is the one the person gave in the request and the form wants it typed out in full here, with every line of it kept";
  const cut = `${whole.slice(0, 159)}…`;
  expect(whole.charAt(158)).not.toBe(" ");
  expect(whole.charAt(159)).not.toBe(" ");
  h.pacer.accept(event({ phase: "exploring", label: cut }));
  const detail = h.pacer.display()?.detail ?? "";
  expect(detail.endsWith("…")).toBe(true);
  expect(whole.startsWith(`${detail.slice(0, -1)} `), detail).toBe(true);
});
