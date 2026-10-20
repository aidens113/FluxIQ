// Coverage of unit-history.ts: which events tell a unit's story, the order
// they are kept in, and the two bounds -- events per unit (the newest kept)
// and units (the one heard from longest ago dropped first).

import { expect, test } from "vitest";

import type { ClientGatewayActivity } from "../index.ts";
import { UnitHistory } from "../unit-history.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;

let sequence = 0;
function event(unit: string, detail?: Detail, fields: Partial<ClientGatewayActivity> = {}): ClientGatewayActivity {
  sequence += 1;
  return {
    activityId: `build:${unit}`,
    sequence,
    subject: { kind: "build", id: unit, projectId: "p" },
    phase: "exploring",
    label: "Working",
    at: "2026-09-30T12:00:00.000Z",
    ...(detail === undefined ? {} : { detail }),
    ...fields
  };
}

const titles = (history: UnitHistory) => history.events().map((kept) => kept.detail?.title ?? `(${kept.phase})`);

test("a unit's story: explained decisions, actions, checks, repairs, steps and its end; not status changes, unexplained decisions or bookkeeping", () => {
  const history = new UnitHistory();
  const kept = [
    history.accept(event("b", undefined)),
    history.accept(event("b", { kind: "thought", title: "Deciding the next step", status: "started" })),
    history.accept(event("b", { kind: "thought", title: "Clicking “Get a quote”", text: "The form is behind it.", status: "succeeded" })),
    history.accept(event("b", { kind: "tool", title: "Clicking “Get a quote”", ref: "core.run_node", status: "started" })),
    history.accept(event("b", { kind: "tool", title: "Using core.state_digest", ref: "core.state_digest", status: "succeeded" })),
    history.accept(event("b", { kind: "tool", title: "Clicking “Get a quote”", ref: "core.run_node", status: "succeeded" })),
    history.accept(event("b", { kind: "thought", title: "Fixing the click", text: "The button moved.", status: "succeeded" }, { phase: "repairing" })),
    history.accept(event("b", { kind: "check", title: "Completion check", text: "The quote form is open.", status: "succeeded" }, { phase: "verifying" })),
    history.accept(event("b", undefined, { phase: "done", final: true }))
  ];
  expect(kept).toStrictEqual([false, false, true, true, false, true, true, true, true]);
  expect(titles(history)).toStrictEqual(["Clicking “Get a quote”", "Clicking “Get a quote”", "Clicking “Get a quote”", "Fixing the click", "Completion check", "(done)"]);
});

test("each unit keeps at most its newest events, and events stay in the order they came, across units", () => {
  const history = new UnitHistory({ units: 5, eventsPerUnit: 3 });
  for (let index = 1; index <= 5; index += 1) history.accept(event("a", { kind: "note", title: `a${index}` }));
  history.accept(event("r", { kind: "note", title: "r1" }));
  history.accept(event("a", { kind: "note", title: "a6" }));
  expect(titles(history)).toStrictEqual(["a4", "a5", "r1", "a6"]);
});

test("past the unit bound, the unit heard from longest ago goes first", () => {
  const history = new UnitHistory({ units: 2, eventsPerUnit: 10 });
  history.accept(event("one", { kind: "note", title: "one" }));
  history.accept(event("two", { kind: "note", title: "two" }));
  history.accept(event("one", { kind: "note", title: "one again" }));
  history.accept(event("three", { kind: "note", title: "three" }));
  expect(titles(history)).toStrictEqual(["one", "one again", "three"]);
  const copy = history.events();
  copy.pop();
  expect(history.events().length, "the caller's copy is its own").toBe(3);
});

// A model provider outage, as Core now tells it (live run `run-muq05kas-058193f0`):
// each unanswered request is said in words, and the build's own ending closes
// the story with Core's message. The bare "Deciding the next step" rows never show.
test("a provider outage: each unanswered request and the build's stop are in the story, the bare decision rows are not", () => {
  const history = new UnitHistory();
  const unanswered = { kind: "thought" as const, title: "Deciding the next step", status: "failed" as const, text: "The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering." };
  const kept = [
    history.accept(event("o", { kind: "thought", title: "Deciding the next step", status: "started" }, { phase: "thinking" })),
    history.accept(event("o", unanswered, { phase: "thinking", label: "The AI model provider did not answer" })),
    history.accept(event("o", { kind: "thought", title: "Deciding the next step", status: "started" }, { phase: "thinking" })),
    history.accept(event("o", unanswered, { phase: "thinking", label: "The AI model provider did not answer" })),
    history.accept(event("o", { kind: "step", title: "Build stopped: the AI model provider is not responding", status: "failed", text: "The build stopped because the AI model provider is not responding: 3 requests in a row got no answer." }, { phase: "failed", final: true }))
  ];
  expect(kept).toStrictEqual([false, true, false, true, true]);
  expect(history.events().at(-1)?.detail?.text).toBe("The build stopped because the AI model provider is not responding: 3 requests in a row got no answer.");
});

test("what the person asked the work is kept, though it is no row: the chat shows it as their message", () => {
  const history = new UnitHistory();
  expect(history.accept(event("q", undefined, { phase: "building", label: "Building the Flow", request: "Switch my store to Millbrook." }))).toBe(true);
  expect(history.accept(event("q", undefined, { phase: "building", label: "Building the Flow", request: "   " }))).toBe(false);
});

// A build with a project supervisor (automation-project-agents-plan, unit W2):
// the build still working is kept whole and never dropped for newer units, and
// the cards of the supervisor's work outlive a trim.

const PLAN: Detail = {
  kind: "note",
  title: "Planned the work",
  project: { kind: "plan", parts: [{ id: "p1", words: "Find the cheapest kettle" }], subflows: [{ key: "search", name: "Search", purpose: "Find the kettle", parts: ["p1"] }] }
};
const run = (unit: string, title: string): ClientGatewayActivity =>
  event(unit, { kind: "step", title, status: "succeeded" }, { activityId: `run:${unit}`, subject: { kind: "run", id: unit, projectId: "p" } });

test("a 1,500-event build in progress keeps every event and its plan card; once it ends it keeps the plan and the request past the bound", () => {
  const history = new UnitHistory({ units: 10, eventsPerUnit: 500, buildEventsCeiling: 5_000 });
  history.accept(event("big", undefined, { request: "Find me the cheapest kettle." }));
  history.accept(event("big", PLAN));
  for (let index = 1; index <= 1_500; index += 1) history.accept(event("big", { kind: "note", title: `n${index}` }, { agent: { role: "builder", briefId: "b1" } }));
  let kept = history.events();
  expect(kept.length, "every event of the build in progress").toBe(1_502);
  expect(kept[1]!.detail?.project?.kind).toBe("plan");
  history.accept(event("big", undefined, { phase: "done", final: true }));
  kept = history.events();
  expect(kept.length).toBe(500);
  expect(kept[0]!.request, "the person's words are pinned").toBe("Find me the cheapest kettle.");
  expect(kept[1]!.detail?.project?.kind, "the plan card is pinned").toBe("plan");
  expect(kept[2]!.detail?.title, "the oldest unpinned rows went first").toBe("n1004");
  expect(kept.at(-1)?.final).toBe(true);
});

test("ten other units never evict the current build; once another build is current, the old one is an ordinary unit", () => {
  const history = new UnitHistory({ units: 10, eventsPerUnit: 500 });
  history.accept(event("current", PLAN));
  for (let index = 1; index <= 12; index += 1) history.accept(run(`r${index}`, `run ${index}`));
  let shown = titles(history);
  expect(shown[0], "the build still working is kept").toBe("Planned the work");
  expect(shown.length).toBe(10);
  expect(shown.slice(1)).toStrictEqual(["run 4", "run 5", "run 6", "run 7", "run 8", "run 9", "run 10", "run 11", "run 12"]);
  history.accept(event("next", { kind: "note", title: "next build" }));
  shown = titles(history);
  expect(shown.includes("Planned the work"), "a build Core never ended is dropped once another build is current").toBe(false);
});

test("a build heard through several units is held whole across them until every one has ended", () => {
  const history = new UnitHistory({ units: 2, eventsPerUnit: 2, buildEventsCeiling: 100 });
  const supervisor = (title: string, fields: Partial<ClientGatewayActivity> = {}) => event("b", { kind: "note", title }, { activityId: "build:b:supervisor", ...fields });
  const builder = (title: string, fields: Partial<ClientGatewayActivity> = {}) => event("b", { kind: "note", title }, { activityId: "build:b:builder", ...fields });
  for (const title of ["s1", "s2", "s3"]) history.accept(supervisor(title));
  for (const title of ["b1", "b2", "b3"]) history.accept(builder(title));
  history.accept(builder("b4", { final: true }));
  history.accept(run("x", "run x"));
  expect(titles(history), "the supervisor still works, so the whole build is held and the run is the unit dropped").toStrictEqual(["s1", "s2", "s3", "b1", "b2", "b3", "b4"]);
  history.accept(supervisor("s4", { phase: "done", final: true }));
  expect(titles(history), "ended: two units of two events each, in the order they came").toStrictEqual(["s3", "b3", "b4", "s4"]);
});
