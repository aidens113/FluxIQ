// A builder's return in a person's words (`return-reason.ts`). t649 (A8 frozen pair 3,
// `run-mv9zn5ob-d929084d`, 00008): the return and "Couldn't build" cards read Core's codes, call
// ids and brief ids, written for the supervisor, never for the person.

import assert from "node:assert/strict";
import { test } from "vitest";
import { projectWords, type ProjectNames } from "../project-words.ts";
import { returnReason } from "../return-reason.ts";

const NAMES: ProjectNames = {
  briefs: new Map([["brief-1", { brief: "build" as const, subflowName: "Pick the branch" }]]),
  subflows: new Map([["pick_branch", "Pick the branch"], ["add_item", "Add the item"]])
};
const STOPPED = "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused. "
  + "The calls it stopped on, latest first: core.submit_subflow answered llm_evidence_loop.repeat_refused (failed) (3 in a row); core.run_node on web.output.dom-extract answered web.inspect.succeeded; core.submit_subflow answered subflow.scope_refused:ba64ff77.";
/** Anything a person should never read: a dotted id, a key or code with underscores, a brief's id, Core's own build stage. */
const INTERNAL = /\b[a-z][\w-]+(?:\.[\w-]{2,})+\b|\b[a-z]+_[a-z_]+\b|\bbrief-\d+\b|Flow Bootstrap/iu;

test("a builder Core stopped says why in words, and none of its codes", () => {
  const said = returnReason(STOPPED, NAMES);
  assert.equal(said, "The builder kept trying without getting any further, so it was stopped.");
});

test("a brief that waited on one that did not pass names that part, never a brief's id or a key", () => {
  const waited = `Brief brief-1 for subflow pick_branch, which this subflow starts after, ended blocked (${STOPPED.slice(0, 200)}...), so this subflow's entry cannot be prepared and its trials could not run.`;
  assert.equal(returnReason(waited, NAMES), "It starts after Pick the branch, which couldn't be built, so it was never started.");
  assert.equal(returnReason(waited.replace("brief-1", "brief-9").replace("ended blocked", "ended partial"), NAMES), "It starts after Pick the branch, which was only partly built, so it was never started.");
  assert.equal(returnReason("Subflow add_item, which this subflow starts after, is not in this dispatch and has no proposal whose trial answered yes: no brief of it has returned in this build.", NAMES),
    "It starts after Add the item, which hasn't passed its test yet, so it was never started.");
});

test("the builder's own words are kept, said as the builder stopping, and a sentence naming a code is left out", () => {
  assert.equal(returnReason("The builder ended this brief blocked: The option is turned off on the item's page, so the item cannot be added this way.", NAMES),
    "The builder stopped: The option is turned off on the item's page, so the item cannot be added this way.");
  assert.equal(returnReason("The list was empty. Its read answered web.extract.none_found (extract_list).", NAMES), "The list was empty.");
  assert.equal(returnReason("The pick_branch part ended before add_item could start.", NAMES), "The Pick the branch part ended before Add the item could start.");
  assert.equal(returnReason("core.run_node answered web.handle.unknown", NAMES), undefined);
  assert.equal(returnReason("", NAMES), undefined);
});

test("no return card's words show a code, a key or an id", () => {
  for (const reason of [STOPPED, `Brief brief-1 for subflow pick_branch, which this subflow starts after, ended blocked (${STOPPED}).`, "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.something_new)."]) {
    const words = projectWords({ kind: "return", briefId: "brief-2", subflowKey: "add_item", outcome: "blocked", reason, spentUsd: 0, calls: 0, trials: 0 }, NAMES, undefined);
    for (const text of [words.title, words.text ?? "", words.card.target ?? "", words.card.outcome ?? ""]) assert.doesNotMatch(text, INTERNAL, text);
    assert.equal(words.card.outcome, "Not started", "a brief that spent nothing and tried nothing never started");
  }
});
