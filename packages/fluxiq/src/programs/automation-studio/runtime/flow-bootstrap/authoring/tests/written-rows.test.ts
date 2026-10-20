// Values read one by one, saved as one row (t738, office `run-mvgf04kw-310fc169`).
//
// The build read four values with four single-value reads and could not store
// them: Write Records took its rows only through an input port no script line
// connects, so every plan holding it was refused `required_input_unconnected`,
// and a `records:` line was read as the record output itself (the synonym in
// `../matching.ts`), refused "named a dataset but no columns" although a schema
// was written. Write Records now takes its rows in a `records` parameter whose
// values may be bindings; these tests hold a script that writes them to the
// plan it should assemble into: the bindings inside the rows resolved
// (`../script-binding.ts`), the port no longer required, and the record
// output's columns read from the row keys when no schema is written
// (`../assembled-record-output.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapIssuePlace } from "../index.ts";
import { matchAuthoringParameter } from "../matching.ts";
import { automationStudioScriptBinding } from "../script-binding.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
// Core's built-ins, Write Records among them, come with the registry.
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
const WRITE_RECORDS = "builtin.data.write-records";
const writeRecords = registry.list(resolution).find((definition) => definition.id === WRITE_RECORDS)!;

/** An account settings page: three values read one by one, then a last step that saves them. */
function script(...save: string[]): string {
  return [
    "flow: Save the account's plan, renewal date and price as one row", // 1
    "step: open the account settings",                                   // 2
    "  node: web.browser.navigate",                                      // 3
    "  url: https://account.test/settings",                              // 4
    "step plan: read the plan name",                                     // 5
    "  node: web.dom.extract",                                           // 6
    "  target: t3",                                                      // 7
    "  extract.mode: text",                                              // 8
    "step renews: read the renewal date",                                // 9
    "  node: web.dom.extract",                                           // 10
    "  target: t4",                                                      // 11
    "  extract.mode: text",                                              // 12
    "step price: read the price",                                        // 13
    "  node: web.dom.extract",                                           // 14
    "  target: t5",                                                      // 15
    "  extract.mode: text",                                              // 16
    "step: save the plan as one row",                                    // 17
    `  node: ${WRITE_RECORDS}`,                                          // 18
    ...save
  ].join("\n");
}

function accept(text: string) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: text }, registry, resolution });
}

function saveNode(text: string): JsonObject {
  const accepted = accept(text);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  const node = accepted.plan.subflows[0]!.nodes.find((candidate) => candidate.definitionId === WRITE_RECORDS);
  if (!node) throw new Error("no Write Records node");
  return node.parameters ?? {};
}

const fieldIds = (recordOutput: unknown): string[] => (((recordOutput as JsonObject).schema as JsonObject).fields as JsonObject[]).map((field) => field.id as string);

describe("Write Records given its rows in a script", () => {
  it("assembles a row of bound values with no unconnected input, each value the earlier step's output by its node", () => {
    const parameters = saveNode(script("  records: [{\"plan\": \"$step.plan.value\", \"renews\": \"$step.renews.value\", \"price\": \"$step.price.value\"}]"));

    expect(parameters.records).toEqual([{
      plan: { $state: { path: "$node.s2.value" } },
      renews: { $state: { path: "$node.s3.value" } },
      price: { $state: { path: "$node.s4.value" } }
    }]);
  });

  it("derives the record output from the row keys when no schema is written, named for the step", () => {
    const parameters = saveNode(script("  records: [{\"plan\": \"$step.plan.value\", \"renews\": \"$step.renews.value\", \"price\": \"$step.price.value\"}]"));

    expect(fieldIds(parameters.recordOutput)).toEqual(["plan", "renews", "price"]);
    expect(parameters.recordOutput).toMatchObject({ label: "save the plan as one row", writeMode: "append" });
    expect((parameters.recordOutput as JsonObject).recordsPath).toBeUndefined();
  });

  it("reads rows written with bare keys and bare bindings, `records: [{a: $step.x.value, b: $step.y.value}]`", () => {
    const parameters = saveNode(script("  records: [{a: $step.plan.value, b: $step.price.value}]"));

    expect(parameters.records).toEqual([{ a: { $state: { path: "$node.s2.value" } }, b: { $state: { path: "$node.s4.value" } } }]);
    expect(fieldIds(parameters.recordOutput)).toEqual(["a", "b"]);
  });

  it("reads a record output written without a schema, columns from the row keys and the dataset as named", () => {
    const parameters = saveNode(script(
      "  recordOutput.datasetId: account_plan",
      "  records: [{\"plan\": \"$step.plan.value\", \"price\": \"$step.price.value\"}]"
    ));

    expect(parameters.recordOutput).toMatchObject({ datasetId: "account_plan" });
    expect(fieldIds(parameters.recordOutput)).toEqual(["plan", "price"]);
  });

  // 0226-0231's shape: a whole record output with its schema, and a `records:` line beside it,
  // which the synonym used to read as the record output and so replaced it.
  it("keeps a record output written whole beside the rows, its schema as written", () => {
    const recordOutput = {
      datasetId: "account_plan",
      schema: { schemaVersion: "0.1", fields: [{ id: "plan", label: "Plan", valueType: "string" }, { id: "renews", label: "Renews", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] },
      writeMode: "replace",
      process: { columns: ["plan", "renews", "price"] }
    };
    const parameters = saveNode(script(
      `  recordOutput: ${JSON.stringify(recordOutput)}`,
      "  records: [{\"plan\": \"$step.plan.value\", \"renews\": \"$step.renews.value\", \"price\": \"$step.price.value\"}]"
    ));

    expect(parameters.recordOutput).toEqual(recordOutput);
    expect((parameters.records as JsonObject[])[0]).toHaveProperty("renews", { $state: { path: "$node.s3.value" } });
  });

  it("refuses a row value naming no earlier label at its parameter, placed at the saving step's own line", () => {
    const accepted = accept(script("  records: [{\"plan\": \"$step.plan.value\", \"owner\": \"$step.nowhere.value\"}]"));

    const errors = accepted.issues.filter((issue) => issue.severity === "error");
    expect(errors.map((issue) => `${issue.code} @ ${issue.path}`)).toEqual(["flow_script.invalid_binding @ plan.subflows.0.nodes.4.parameters.records"]);
    expect(errors[0]?.message).toContain("\"$step.nowhere.value\" names no labelled step of this block");
    expect(automationStudioFlowBootstrapIssuePlace(accepted.locator, errors[0]?.path)).toEqual({ step: "save the plan as one row", line: 17 });
  });

  it("is refused, as before, when the rows are left out and nothing is connected: the record output has no columns to save", () => {
    const accepted = accept(script("  recordOutput.datasetId: account_plan"));

    expect(accepted.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)).toContain("record_schema.not_derivable");
  });
});

describe("which parameter `records:` means", () => {
  it("is Write Records' own rows parameter, matched by id before the synonym for a record output", () => {
    expect(matchAuthoringParameter("records", writeRecords)?.id).toBe("records");
    expect(matchAuthoringParameter("rows", writeRecords)?.id).toBe("records");
    expect(matchAuthoringParameter("recordOutput", writeRecords)?.id).toBe("recordOutput");
  });

  it("is still the record output on a node that declares no rows parameter", () => {
    const listing = registry.list(resolution).find((definition) => definition.id === "web.output.dom-extract_list")!;
    expect(matchAuthoringParameter("records", listing)?.id).toBe("recordOutput");
  });
});

describe("a binding inside a written list or object", () => {
  const scope = { labelKeys: new Map([["plan", "s2"]]), elsewhere: () => false };
  const rows = writeRecords.parameters.find((parameter) => parameter.id === "records")!;
  const recordOutput = writeRecords.parameters.find((parameter) => parameter.id === "recordOutput")!;

  it("is the state binding it names, at any depth, with every other value kept as written", () => {
    expect(automationStudioScriptBinding("[{\"plan\": \"$step.plan.value\", \"note\": \"as shown\", \"count\": 2, \"parts\": [\"$step.plan.value.first\"]}]", rows, scope)).toEqual({
      value: [{ plan: { $state: { path: "$node.s2.value" } }, note: "as shown", count: 2, parts: [{ $state: { path: "$node.s2.value.first" } }] }]
    });
  });

  it("leaves a list or object holding no binding to the ordinary reader", () => {
    expect(automationStudioScriptBinding("[{\"plan\": \"Basic\", \"price\": \"$5\"}]", rows, scope)).toBeUndefined();
    expect(automationStudioScriptBinding("[{plan: Basic}]", rows, scope)).toBeUndefined();
  });

  // A drafted step's parameters reach assembly as JSON, and a draft reads an earlier step by its own id,
  // `{"$state":{"path":"$step.<id>.<output>"}}`: a run-state path, never a script label to look up.
  it("keeps a state binding written as one exactly as written, inside a list or not", () => {
    const drafted = "[{\"plan\": {\"$state\": {\"path\": \"$step.step-7.value\"}}, \"price\": \"$step.plan.value\"}]";
    expect(automationStudioScriptBinding(drafted, rows, scope)).toEqual({
      value: [{ plan: { $state: { path: "$step.step-7.value" } }, price: { $state: { path: "$node.s2.value" } } }]
    });
    expect(automationStudioScriptBinding("{\"$state\": {\"path\": \"$step.step-7.value\"}}", rows, scope)).toBeUndefined();
  });

  it("leaves a parameter that takes no binding as written, for validation to answer", () => {
    expect(automationStudioScriptBinding("{\"datasetId\": \"$step.plan.value\"}", recordOutput, scope)).toBeUndefined();
  });
});
