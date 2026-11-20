import { parseAutomationStudioRecordOutput } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../plan/index.ts";
import { automationStudioFlowBootstrapPlanWithResultProcessing } from "../plan.ts";

function schema(...ids: string[]): JsonObject {
  return { schemaVersion: "0.1", fields: ids.map((id) => ({ id, label: id, valueType: "string" })) };
}

/** A plan of one read: a list whose fields include two marks, under an output declaring the request's four columns. */
function plan(output: JsonObject, extra: JsonObject[] = []): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "router", rules: [] },
    subflows: [{
      key: "main",
      name: "main",
      role: "primary",
      edges: [],
      nodes: [
        { key: "s1", definitionId: "sample.read-list", definitionVersion: "1", parameters: { list: { handle: "list.1", fields: { title: "t", price: "p", rating: "r", url: "u", featured: "f", sponsored: "s" } }, recordOutput: output } },
        ...extra.map((parameters, index) => ({ key: `s${index + 2}`, definitionId: "sample.read-list", definitionVersion: "1", parameters }))
      ]
    }]
  } as unknown as AutomationStudioFlowBootstrapPlan;
}

const OUTPUT: JsonObject = { datasetId: "listings", writeMode: "append", schema: schema("title", "price", "rating", "url"), process: { dedupe: { by: ["url"] } } };

function outputOf(result: { plan: AutomationStudioFlowBootstrapPlan }, node = 0): JsonObject {
  return result.plan.subflows[0]!.nodes[node]!.parameters!.recordOutput as JsonObject;
}

describe("the draft's result processing on the plan's record outputs (t970)", () => {
  it("stores the marks it filters by, shows the columns from before, and keeps the read's own processing", () => {
    const result = automationStudioFlowBootstrapPlanWithResultProcessing(plan(OUTPUT), { result: { where: [{ field: "sponsored", is: "absent" }, { field: "featured", is: "present" }, { field: "price", lessThan: 50 }] } });
    expect(result.issues).toEqual([]);
    const output = outputOf(result);
    expect((output.schema as { fields: { id: string }[] }).fields.map((field) => field.id)).toEqual(["title", "price", "rating", "url", "sponsored", "featured"]);
    expect(output.process).toEqual({
      dedupe: { by: ["url"] },
      where: [{ field: "sponsored", is: "absent" }, { field: "featured", is: "present" }, { field: "price", lessThan: 50 }],
      columns: ["title", "price", "rating", "url"]
    });
    // What it writes is a record output the contract takes as it stands.
    expect(parseAutomationStudioRecordOutput({ ...output, recordsPath: "records" }).ok).toBe(true);
  });

  it("leaves a working read, and an output another declaration names, to themselves", () => {
    const working: JsonObject = { list: { fields: { title: "t" } }, recordOutput: { datasetId: "lookup", purpose: "intermediate", writeMode: "append", schema: schema("title") } };
    const result = automationStudioFlowBootstrapPlanWithResultProcessing(plan(OUTPUT, [working]), { result: { limit: 3 }, listings: { limit: 7 } });
    expect(outputOf(result).process).toEqual({ dedupe: { by: ["url"] }, limit: 7 });
    expect(outputOf(result, 1).process).toBeUndefined();
  });

  it("warns and leaves an output whose read does not read a column the declaration names", () => {
    const result = automationStudioFlowBootstrapPlanWithResultProcessing(plan(OUTPUT), { result: { where: [{ field: "colour", is: "present" }] } });
    expect(result.issues.map((issue) => [issue.severity, issue.code])).toEqual([["warning", "result_processing.not_applicable"]]);
    expect(outputOf(result)).toEqual(OUTPUT);
  });

  it("changes nothing with no declaration", () => {
    const given = plan(OUTPUT);
    expect(automationStudioFlowBootstrapPlanWithResultProcessing(given, undefined).plan).toBe(given);
    expect(automationStudioFlowBootstrapPlanWithResultProcessing(given, {}).plan).toBe(given);
  });
});
