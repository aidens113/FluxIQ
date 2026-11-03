// Coverage of project-words.ts: each card of the supervisor's work in words,
// named by its subflow and never by an id, each with an icon Core pins and the
// chat draws (the parity the action cards keep, `icons/`), and each
// agent's lane by its role and subflow.

import assert from "node:assert/strict";
import { test } from "vitest";
import { ACTIVITY_ACTION_ICONS } from "fluxiq/ui";
import type { ActivityProjectCard } from "fluxiq/ui";
import { LUCIDE_ICON_NODES } from "../../../../icons/index.ts";
import { laneWords, projectWords, type ProjectNames } from "../project-words.ts";

const NONE: ProjectNames = { briefs: new Map(), subflows: new Map() };
const brief = (kind: "build" | "survey" | "repair" | "reset", purpose = "Find the kettle"): ActivityProjectCard =>
  ({ kind: "brief", briefId: `b-${kind}`, brief: kind, subflowKey: "search", subflowName: "Search", purpose, allowanceUsd: 0.004 });

const EVERY_CARD: ActivityProjectCard[] = [
  { kind: "plan", parts: [], subflows: [{ key: "search", name: "Search", purpose: "", parts: [] }] },
  brief("build"),
  brief("survey"),
  brief("repair"),
  brief("reset"),
  { kind: "return", briefId: "b", subflowKey: "search", outcome: "blocked", reason: "", spentUsd: 0, calls: 0, trials: 0 },
  { kind: "receipt", receipt: "subflow_trial", receiptId: "r", verdict: "failed" }
];

test("every icon a project card shows is one Core pins for an action kind, and one the panel draws", () => {
  for (const card of EVERY_CARD) {
    const icon = projectWords(card, NONE, undefined).card.icon;
    const named = ACTIVITY_ACTION_ICONS[icon];
    assert.ok(named !== undefined, `${card.kind}: ${icon} is a kind Core pins`);
    assert.ok(Object.hasOwn(LUCIDE_ICON_NODES, named), `${card.kind}: the panel draws ${named}`);
  }
});

test("each brief says what its builder does, and a reset names the site, not a subflow", () => {
  assert.deepEqual(["build", "survey", "repair", "reset"].map((kind) => projectWords(brief(kind as "build"), NONE, undefined).title), [
    "Building Search: Find the kettle",
    "Surveying Search: Find the kettle",
    "Repairing Search: Find the kettle",
    "Resetting the site: Find the kettle"
  ]);
  const words = projectWords(brief("build", ""), NONE, undefined);
  assert.equal(words.title, "Building Search");
  assert.equal(words.card.outcome, "Allowance under $0.01");
});

test("a return and a receipt are named by the brief's subflow, else the plan's, else the agent's, else by no name", () => {
  const returned: ActivityProjectCard = { kind: "return", briefId: "b1", subflowKey: "cart", outcome: "blocked", reason: "The cart needs a sign-in.", spentUsd: 0.1, calls: 1, trials: 0 };
  const names: ProjectNames = { briefs: new Map([["b1", { brief: "repair" as const, subflowName: "Checkout" }]]), subflows: new Map([["cart", "Cart"]]) };
  assert.equal(projectWords(returned, names, undefined).title, "Couldn't repair Checkout");
  assert.equal(projectWords(returned, { briefs: new Map(), subflows: names.subflows }, undefined).title, "Couldn't build Cart");
  assert.equal(projectWords(returned, NONE, { role: "builder", subflowName: "Basket" }).title, "Couldn't build Basket");
  const unnamed = projectWords(returned, NONE, undefined);
  assert.deepEqual([unnamed.title, unnamed.text, unnamed.card.target, unnamed.card.outcome, unnamed.card.state], ["Couldn't build", "The cart needs a sign-in.", null, "Spent $0.10 · 1 call · 0 tests", "failed"]);
  const receipt = projectWords({ kind: "receipt", briefId: "b1", receipt: "subflow_trial", receiptId: "r", verdict: "failed" }, names, undefined);
  assert.deepEqual([receipt.title, receipt.card.target, receipt.card.outcome, receipt.card.state], ["Tested Checkout", "Checkout", "Didn't pass", "failed"]);
  assert.equal(projectWords({ kind: "receipt", receipt: "subflow_trial", receiptId: "r", verdict: "passed" }, NONE, undefined).title, "Tested one part");
});

test("a plan with no budget says no budget; one with only a reserve says what is kept back", () => {
  const plan = (fields: Partial<Extract<ActivityProjectCard, { kind: "plan" }>>): ActivityProjectCard => ({ kind: "plan", parts: [{ id: "p", words: "Find it" }], subflows: [{ key: "s", name: "Search", purpose: "Find it", parts: ["p"] }], ...fields });
  assert.equal(projectWords(plan({}), NONE, undefined).card.outcome, null);
  assert.equal(projectWords(plan({ reserveUsd: 0.05 }), NONE, undefined).card.outcome, "$0.05 kept back");
  assert.deepEqual(projectWords(plan({}), NONE, undefined).card.rows, [{ heading: "Parts", items: ["Find it"] }, { heading: "Pieces", items: ["Search: Find it"] }]);
  assert.equal(projectWords(plan({}), NONE, undefined).title, "Planned 1 piece");
});

test("each agent's lane is its role, and the subflow it works on", () => {
  assert.equal(laneWords({ role: "supervisor", subflowName: "Search" }), "Supervisor");
  assert.equal(laneWords({ role: "builder", briefId: "b1", subflowName: "Search" }), "Builder · Search");
  assert.equal(laneWords({ role: "repair" }), "Repair");
  assert.equal(laneWords({ role: "validator", subflowName: "Cart" }), "Validator · Cart");
});
