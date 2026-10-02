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
