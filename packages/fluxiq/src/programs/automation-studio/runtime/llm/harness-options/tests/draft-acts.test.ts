// The model is told, beside its draft, when a list read it ran misses a column
// the instruction names.
//
// The build declares the instruction's named columns as the read's schema, and
// a named column no field reads was a warning on the plan that nobody saw
// (F35). The draft entry is in front of the model on every decision after the
// read, so the note goes there: information, never an act and never a refusal.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftActs } from "../draft-acts.ts";

const COLUMNS = "Scrape every product the search returns as a table with columns name, price and rating.";

function readStep(position: number, fields: JsonObject, disposition: AutomationStudioFlowDraftStep["disposition"] = "taken"): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-extract_list", toolId: "core.run_node",
    input: { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "list.1", fields } }, consequences: [] },
    effect: "observe", effectApplied: true, disposition, proposes: true
  };
}

const navigate: AutomationStudioFlowDraftStep = {
  position: 1, id: "d1", iteration: 1, actionId: "web.output.browser-navigate", toolId: "core.run_node",
  input: { node: "web.output.browser-navigate", parameters: { url: "https://store.test/" }, consequences: [] },
  effect: "mutate", effectApplied: true, disposition: "kept", proposes: true
};

const notesOf = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap((item) => typeof item === "object" && item !== null && typeof (item as JsonObject).note === "string" ? [(item as JsonObject).note as string] : [])
  : [];

describe("the draft says when a read misses a column the instruction names", () => {
  it("names the column, and no step, in the entry the model is shown", () => {
    const steps = [navigate, readStep(2, { name: ".name", price: ".price", plus: ".plus" })];
    const acts = automationStudioFlowBootstrapDraftActs({ instructionText: COLUMNS }).acts(steps);

    expect(notesOf(acts)).toEqual(["The instruction asks for a column \"rating\" that no read in the draft gives."]);
    const entry = automationStudioFlowDraftEntry({ steps, authored: true, acts });
    expect(JSON.stringify(entry?.value)).toContain("no read in the draft gives");
    expect(JSON.stringify(entry?.value)).not.toContain("of step 2");
  });

  it("names every column no read gives, once for the whole draft", () => {
    const acts = automationStudioFlowBootstrapDraftActs({ instructionText: COLUMNS }).acts([navigate, readStep(2, { name: ".name" }), readStep(3, { name: ".title" })]);
    expect(notesOf(acts)).toEqual(["The instruction asks for columns \"price\", \"rating\" that no read in the draft gives."]);
  });

  // Run `run-murdouox-c5294247`, R4: the filter listing a repeat runs over was
  // named as the read missing the column, and the model reworked that listing
  // for four decisions instead of adding the read the table needed.
  it("never names the listing an act repeats over, and is quiet once a later read gives the column", () => {
    const friends = "Confirm every friend request from someone with at least 3 mutual friends, then give me a table with columns name and mutualFriends.";
    const listing = readStep(2, { name: ".name", requestId: ".id" });
    const only = automationStudioFlowBootstrapDraftActs({ instructionText: friends }).acts([navigate, listing]);
    expect(notesOf(only)).toEqual(["The instruction asks for a column \"mutualFriends\" that no read in the draft gives."]);
    const withResultRead = automationStudioFlowBootstrapDraftActs({ instructionText: friends }).acts([navigate, listing, readStep(3, { name: ".name", mutualFriends: ".mutual" })]);
    expect(notesOf(withResultRead)).toEqual([]);
  });

  it("says nothing when every named column is read, the instruction names none, or the read was withdrawn", () => {
    const all = { name: ".name", price: ".price", rating: ".stars", plus: ".plus" };
    const missing = { name: ".name", price: ".price" };
    const cases: Array<{ instructionText?: string; steps: AutomationStudioFlowDraftStep[] }> = [
      { instructionText: COLUMNS, steps: [navigate, readStep(2, all)] },
      { instructionText: "Scrape every product the search returns.", steps: [navigate, readStep(2, missing)] },
      { steps: [navigate, readStep(2, missing)] },
      { instructionText: COLUMNS, steps: [navigate, readStep(2, missing, "dropped")] }
    ];
    for (const { instructionText, steps } of cases) {
      const acts = automationStudioFlowBootstrapDraftActs({ instructionText }).acts(steps);
      expect(notesOf(acts)).toEqual([]);
      expect(JSON.stringify(acts ?? null)).not.toContain("no field");
    }
  });

  it("never counts the note as an act still owed", () => {
    const draftActs = automationStudioFlowBootstrapDraftActs({ instructionText: COLUMNS });
    const steps = [navigate, readStep(2, { name: ".name" })];
    expect(draftActs.actsMissing(steps)).toEqual(draftActs.actsMissing([navigate, readStep(2, { name: ".name", price: ".p", rating: ".r" })]));
  });
});

// Run `run-murwcaj0-40e56557`, R4: the draft read name and mutualFriends at
// step 7, confirmed at step 10 and read nothing after, so the table was the
// page before the confirms and the judge refuted it. The draft now says so,
// naming the last act step and never the read.
describe("the draft says when every read giving the named columns runs before the last act", () => {
  const RUN = "Go through my pending friend requests and confirm everyone I have at least five mutual friends with, leaving the rest alone. Then give me a table of every request the list now shows as accepted, in list order, with columns name and mutualFriends.";
  const BEFORE = "Every read in the draft that gives \"name\", \"mutualFriends\" runs before step 10, the last step that does what the instruction asks, so it shows the page as it was before that act. If the instruction asks for what the page shows after it, run a new read after step 10 and add it; leave every read before step 10 where it is.";
  const BEFORE_REPEATED = "Every read in the draft that gives \"name\", \"mutualFriends\" runs before step 10, the last step that does what the instruction asks, so it shows the page as it was before that act. If the instruction asks for what the page shows after it, run a new read after step 10 and add it; the listing step 10 repeats over stays where it is, before step 10.";

  function confirmStep(position: number, disposition: AutomationStudioFlowDraftStep["disposition"] = "taken"): AutomationStudioFlowDraftStep {
    return {
      position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", toolId: "core.run_node",
      input: { node: "web.output.dom-click", parameters: { target: "button.confirm" }, consequences: [] },
      effect: "mutate", effectApplied: true, disposition, proposes: true, acts: ["a1"]
    };
  }
  const read7 = readStep(7, { name: ".name", mutualFriends: ".mutual", requestId: ".id" });

  it("names step 10 and not the read at step 7", () => {
    const steps = [navigate, read7, confirmStep(10)];
    const notes = notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts(steps));
    expect(notes).toEqual([BEFORE]);
    expect(notes.join(" ")).not.toContain("step 7");
  });

  // R18 (run `run-musr9pv3-f4bf6256`, decisions 0037, 0044, 0056): told the
  // draft "needs a read after step N", the model moved the listing step N
  // repeats over after it. A repeated act -- the first step of its span, or a
  // step inside one -- is told the listing stays before it.
  it("says the listing stays before a repeated last act, whether the act starts the span or sits inside it", () => {
    const starts = { ...confirmStep(10), routing: { kind: "repeat" as const, over: "d7", through: "d10" } };
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts([navigate, read7, starts]))).toEqual([BEFORE_REPEATED]);
    const { acts: _none, ...open } = confirmStep(9);
    const opens: AutomationStudioFlowDraftStep = { ...open, routing: { kind: "repeat" as const, over: "d7", through: "d10" } };
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts([navigate, read7, opens, confirmStep(10)]))).toEqual([BEFORE_REPEATED]);
  });

  it("is silent once a read giving every column follows the last act", () => {
    const steps = [navigate, read7, confirmStep(10), readStep(11, { name: ".name", mutualFriends: ".mutual" })];
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts(steps))).toEqual([]);
  });

  it("is silent with no step that does an instructed act, or when the only act step was withdrawn", () => {
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts([navigate, read7]))).toEqual([]);
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts([navigate, read7, confirmStep(10, "dropped")]))).toEqual([]);
  });

  it("says only the unread-column note when no read gives every column", () => {
    const steps = [navigate, readStep(7, { name: ".name", requestId: ".id" }), confirmStep(10)];
    expect(notesOf(automationStudioFlowBootstrapDraftActs({ instructionText: RUN }).acts(steps)))
      .toEqual(["The instruction asks for a column \"mutualFriends\" that no read in the draft gives."]);
  });
});
