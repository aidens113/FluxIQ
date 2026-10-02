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
import { authoringInstructionRecordColumns } from "../instruction-record-columns.ts";

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
