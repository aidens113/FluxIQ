// An extraction whose author declared no columns stores the ones the
// instruction names, and nothing else.
//
// Live run 12 built a list read of six fields -- name, price, rating and url,
// which the instruction named, and `plus` and `ad`, read only to filter by --
// with no record output, so every row was stored with two columns nobody asked
// for. Each case here goes through the same door the build does: the draft the
// build accrued (`assembleAutomationStudioFlowDraftPlan`), or a reply's own
// plan (`acceptAutomationStudioFlowBootstrapResult`).
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapRecordOutputIssues } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, assembleAutomationStudioFlowDraftPlan } from "../index.ts";
import { authoringInstructionRecordColumns, automationStudioFlowBootstrapDraftUnreadColumnsSentence, automationStudioFlowBootstrapUnreadColumnsSentence } from "../instruction-record-columns.ts";

const definitions = webDomainNodeDefinitionsFixture();
const registry = new AutomationStudioNodeRegistry(definitions);
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};
const extractListDefinition = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;

/** Run 12's instruction, word for word. */
const RUN_12_INSTRUCTION = "Find every pair of wireless earbuds in the store's search results that is Brightaisle Plus eligible, rated 4.0 or higher and priced under $50, going through every page of results. Leave out sponsored placements and accessories such as ear tips or charging cases, list each pair only once even if it turns up on two pages, and keep the order the search results show them in, with columns name, price, rating and url.";

/** Run 12's read: six fields, two of them read only to filter by. */
const RUN_12_READ: JsonObject = {
  item: "div.result-card",
  fields: { name: "h2", price: ".price", rating: ".rating", url: "a@href", plus: ".plus-badge", ad: ".sponsored" },
  where: [{ field: "ad", absent: true }, { field: "plus", present: true }],
  paginate: { mode: "next", next: "a.next", maxPages: 5 }
};

function draftStep(parameters: JsonObject): AutomationStudioFlowDraftStep {
  return { position: 1, iteration: 1, callId: "call.1", actionId: "web.output.dom-extract_list", input: { parameters }, effect: "observe", effectApplied: true, disposition: "kept" };
}

/** The read's record output, and the issues, after the build assembles its draft. */
function assembled(parameters: JsonObject, instructionText: string | undefined) {
  const result = assembleAutomationStudioFlowDraftPlan({
    steps: [draftStep(parameters)],
    write: (step) => ({
      description: "read the results",
      node: step.actionId,
      entries: Object.entries(step.input.parameters as JsonObject).map(([key, value]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) }))
    }),
    registry,
    resolution,
    summary: "Read the earbuds.",
    instructionText
  });
  expect(result.plan).toBeDefined();
  return { recordOutput: result.plan?.subflows[0]?.nodes[0]?.parameters?.recordOutput, issues: result.issues };
}

function declaredIds(recordOutput: JsonValue | undefined): string[] {
  const schema = (recordOutput as JsonObject | null)?.schema as JsonObject | undefined;
  return ((schema?.fields ?? []) as JsonObject[]).map((field) => String(field.id));
}

describe("an extraction with no declared columns", () => {
  it("run 12: four named columns, six fields, no record output -> a four-column schema", () => {
    const { recordOutput, issues } = assembled({ extractList: RUN_12_READ }, RUN_12_INSTRUCTION);

    expect(declaredIds(recordOutput)).toEqual(["name", "price", "rating", "url"]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractListDefinition, recordOutput)).toEqual([]);
    expect(issues.filter((issue) => issue.code === "record_output.named_column_unmatched")).toEqual([]);
  });

  it("run 12 as a reply's own plan, with the record output written as null", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({
      result: { summary: "Read the earbuds.", plan: { subflows: [{ nodes: [{ definitionId: "web.output.dom-extract_list", name: "Plus earbuds", parameters: { extractList: RUN_12_READ, recordOutput: null } }] }] } },
      registry,
      resolution,
      instructionText: RUN_12_INSTRUCTION
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(declaredIds(accepted.plan.subflows[0]?.nodes[0]?.parameters?.recordOutput)).toEqual(["name", "price", "rating", "url"]);
  });

  it("a partial match declares the columns that matched and says which names matched nothing", () => {
    const { recordOutput, issues } = assembled(
      { extractList: { ...RUN_12_READ, fields: { Product_Name: "h2", price: ".price", url: "a@href", plus: ".plus-badge" } } },
      "List the earbuds as a table with columns product name, price, stars and url."
    );

    expect(declaredIds(recordOutput)).toEqual(["Product_Name", "price", "url"]);
    const labels = (((recordOutput as JsonObject).schema as JsonObject).fields as JsonObject[]).map((field) => field.label);
    expect(labels).toEqual(["product name", "price", "url"]);
    const unmatched = issues.filter((issue) => issue.code === "record_output.named_column_unmatched");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({ severity: "warning", path: "plan.subflows.0.nodes.0.parameters.recordOutput" });
    expect(unmatched[0]!.message).toContain("\"stars\"");
  });

  it("no named column matching any field declares nothing, and says so", () => {
    const { recordOutput, issues } = assembled({ extractList: RUN_12_READ }, "Collect the earbuds with columns title and cost.");

    expect(recordOutput).toBeNull();
    expect(issues.find((issue) => issue.code === "record_output.named_column_unmatched")?.message).toContain("every field it reads");
  });

  it("an author's object without a schema takes the named columns rather than every field", () => {
    const { recordOutput } = assembled({ extractList: RUN_12_READ, recordOutput: { datasetId: "plus_earbuds" } }, RUN_12_INSTRUCTION);

    expect(recordOutput).toMatchObject({ datasetId: "plus_earbuds" });
    expect(declaredIds(recordOutput)).toEqual(["name", "price", "rating", "url"]);
  });
});

describe("what is left alone", () => {
  it("an author-declared schema is never overwritten", () => {
    const authored: JsonObject = {
      datasetId: "plus_earbuds",
      schema: { schemaVersion: "0.1", fields: ["name", "price", "rating", "url", "plus"].map((id) => ({ id, label: id, valueType: "string" })) },
      writeMode: "append"
    };
    const { recordOutput, issues } = assembled({ extractList: RUN_12_READ, recordOutput: authored }, RUN_12_INSTRUCTION);

    expect(declaredIds(recordOutput)).toEqual(["name", "price", "rating", "url", "plus"]);
    expect(issues.filter((issue) => issue.code === "record_output.named_column_unmatched")).toEqual([]);
  });

  it("an instruction that names no columns leaves the record output empty", () => {
    expect(assembled({ extractList: RUN_12_READ }, "Find every pair of Plus earbuds under $50.").recordOutput).toBeNull();
  });

  it("a build with no instruction text leaves the record output empty", () => {
    expect(assembled({ extractList: RUN_12_READ }, undefined).recordOutput).toBeNull();
  });
});

describe("matching a named column to a field", () => {
  it("matches exactly first, then ignoring case and separators, each field once", () => {
    expect(authoringInstructionRecordColumns({ named: ["Name", "name", "unit-price", "URL"], fieldKeys: ["name", "Name", "unit_price", "url"] })).toEqual({
      columns: [{ id: "Name", label: "Name" }, { id: "name", label: "name" }, { id: "unit_price", label: "unit-price" }, { id: "url", label: "URL" }],
      unmatched: []
    });
    expect(authoringInstructionRecordColumns({ named: ["Name", "Name 2"], fieldKeys: ["name"] })).toEqual({
      columns: [{ id: "name", label: "Name" }],
      unmatched: ["Name 2"]
    });
  });
});

// The one sentence the build and the judge are told, by this matcher: names
// from the instruction only, and nothing at all when there is nothing to say.
describe("the sentence for a named column no field reads", () => {
  it("names the columns the instruction asks for that no field reads", () => {
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: RUN_12_INSTRUCTION, fieldKeys: ["name", "price", "url", "plus"] }))
      .toBe("The instruction asks for a column \"rating\" that no field reads.");
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: RUN_12_INSTRUCTION, fieldKeys: ["Name", "url"] }))
      .toBe("The instruction asks for columns \"price\", \"rating\" that no field reads.");
  });

  it("says nothing when every named column is read, none is named, or there are no fields", () => {
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: RUN_12_INSTRUCTION, fieldKeys: ["name", "price", "rating", "url", "ad"] })).toBeUndefined();
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: "Find every pair of Plus earbuds under $50.", fieldKeys: ["name"] })).toBeUndefined();
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: undefined, fieldKeys: ["name"] })).toBeUndefined();
    expect(automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText: RUN_12_INSTRUCTION, fieldKeys: [] })).toBeUndefined();
  });
});

// Said beside the build's draft, about the draft as a whole (run
// `run-murdouox-c5294247`, R4). The note used to be said per read and to name
// that read's step: a draft whose only read was the filter listing a repeat
// runs over was told "no field of step 12 reads mutualFriends", and the model
// spent its last four decisions rewriting and rerunning that listing instead
// of adding the read after the confirms that the table needed. A column is
// missing only when no read of the draft gives it, and saying so names no step,
// so the note points at no read the model would then rework.
describe("the sentence beside the draft for a named column no read gives", () => {
  const FRIENDS = "Confirm every friend request from someone with at least 3 mutual friends, then give me a table with columns name and mutualFriends.";

  it("names the column and no step when no read of the draft gives it", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: FRIENDS, reads: [{ fieldKeys: ["name", "url", "requestId"] }] }))
      .toBe("The instruction asks for a column \"mutualFriends\" that no read in the draft gives.");
  });

  it("holds the instruction to every read at once: a column one read gives is not missing", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: FRIENDS, reads: [{ fieldKeys: ["name", "url"] }, { fieldKeys: ["name", "mutualFriends"] }] })).toBeUndefined();
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: RUN_12_INSTRUCTION, reads: [{ fieldKeys: ["name"] }, { fieldKeys: ["url"] }] }))
      .toBe("The instruction asks for columns \"price\", \"rating\" that no read in the draft gives.");
  });

  it("says nothing when there is no read with fields, or no named column", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: FRIENDS, reads: [] })).toBeUndefined();
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: FRIENDS, reads: [{ fieldKeys: [] }] })).toBeUndefined();
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: "Confirm every friend request.", reads: [{ fieldKeys: ["name"] }] })).toBeUndefined();
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: undefined, reads: [{ fieldKeys: ["name"] }] })).toBeUndefined();
  });
});

// Run `run-murwcaj0-40e56557`, R4: the draft's only read of name and
// mutualFriends was step 7, before the confirm at step 10, and nothing read the
// list after it, so the table showed the page before the confirms and the judge
// refuted it. The note names the last act step, never the read, and is never
// said with the unread-column note.
describe("the sentence beside the draft when every read giving the columns runs before the last act", () => {
  const RUN = "Go through my pending friend requests and confirm everyone I have at least five mutual friends with, leaving the rest alone. Then give me a table of every request the list now shows as accepted, in list order, with columns name and mutualFriends.";
  const BEFORE = "Every read in the draft that gives \"name\", \"mutualFriends\" runs before step 10, the last step that does what the instruction asks, so it shows the page as it was before that act. If the instruction asks for what the page shows after it, run a new read after step 10 and add it; leave every read before step 10 where it is.";
  const BEFORE_REPEATED = "Every read in the draft that gives \"name\", \"mutualFriends\" runs before step 10, the last step that does what the instruction asks, so it shows the page as it was before that act. If the instruction asks for what the page shows after it, run a new read after step 10 and add it; the listing step 10 repeats over stays where it is, before step 10.";

  it("names the last act step, and no read, when every read giving every column runs before it", () => {
    const sentence = automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name", "mutualFriends", "requestId"] }], lastActStep: 10 });
    expect(sentence).toBe(BEFORE);
    expect(sentence).not.toContain("step 7");
  });

  // R18 (run `run-musr9pv3-f4bf6256`, decisions 0037, 0044, 0056): "the draft
  // needs a read after step N" was read as "move the read after step N", and
  // the model moved the loop's own listing after the act it walks. The note now
  // says to run a new read, and that the listing stays before the act.
  it("says to run a new read, and that the listing the act repeats over stays before it", () => {
    const sentence = automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name", "mutualFriends"] }], lastActStep: 10, lastActRepeats: true });
    expect(sentence).toBe(BEFORE_REPEATED);
    expect(sentence).not.toContain("step 7");
    expect(sentence).not.toContain("needs a read after");
  });

  it("is silent when a read giving every column follows the last act", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({
      instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name", "mutualFriends"] }, { step: 11, fieldKeys: ["name", "mutualFriends"] }], lastActStep: 10
    })).toBeUndefined();
  });

  it("is silent with no act step", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name", "mutualFriends"] }] })).toBeUndefined();
  });

  it("gives way to the unread-column note when no read gives every column", () => {
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name", "requestId"] }], lastActStep: 10 }))
      .toBe("The instruction asks for a column \"mutualFriends\" that no read in the draft gives.");
    // Every column given, but by no one read: neither note.
    expect(automationStudioFlowBootstrapDraftUnreadColumnsSentence({
      instructionText: RUN, reads: [{ step: 7, fieldKeys: ["name"] }, { step: 8, fieldKeys: ["mutualFriends"] }], lastActStep: 10
    })).toBeUndefined();
  });
});
