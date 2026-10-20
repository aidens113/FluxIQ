import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../contracts.ts";
import { resolveAutomationNodeParameterValues } from "../../parameter-bindings.ts";
import { writeRecordsNode } from "../write-records.ts";

const RECORD_OUTPUT = {
  datasetId: "catalog.products",
  label: "Products",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "title", label: "Title", valueType: "string" },
      { id: "cardNumber", label: "Card number", valueType: "string", handling: "exclude" }
    ]
  },
  writeMode: "append",
  maxRecords: 500
};

const ROWS: JsonValue[] = [{ title: "synthetic-title", cardNumber: "synthetic-excluded" }];

describe("builtin.data.write-records", () => {
  it("declares an optional records input, a records data output, and a manual-only record output edited by the record-output control", () => {
    // Not required (t738): a script cannot connect a port, so the rows may come from the records parameter instead.
    expect(writeRecordsNode.inputs.find((port) => port.id === "records")).toMatchObject({ valueType: "array", required: false });
    expect(writeRecordsNode.outputs.find((port) => port.id === "records")).toEqual({ id: "records", label: "Records", valueType: "array", role: "data" });
    const parameter = writeRecordsNode.parameters.find((entry) => entry.id === "recordOutput");
    expect(parameter).toMatchObject({ valueType: "json", defaultValue: null, allowStateBinding: false, ui: { control: "record-output" } });
  });

  it("emits one records.write effect carrying the parsed record output and the input's rows, as the input holds them", async () => {
    const result = await execute({ records: ROWS }, { recordOutput: RECORD_OUTPUT });
    const payload = result.effects?.[0]?.payload as Record<string, JsonValue>;

    expect(result).toEqual({
      status: "success",
      route: "success",
      outputs: {},
      effects: [{ type: "records.write", payload: { recordOutput: { ...RECORD_OUTPUT, recordsPath: "records" }, records: ROWS } }]
    });
    expect(payload.records).toBe(ROWS);
    expect(payload.recordOutput).not.toBe(RECORD_OUTPUT);
  });

  it.each([
    ["a records path", { ...RECORD_OUTPUT, recordsPath: "page.items" }],
    ["a records path that is not a path", { ...RECORD_OUTPUT, recordsPath: "not a path" }]
  ])("ignores %s, since the rows come from the Records input", async (_case, recordOutput) => {
    const result = await execute({ records: ROWS }, { recordOutput });

    expect(result).toMatchObject({ status: "success", effects: [{ type: "records.write", payload: { recordOutput: { recordsPath: "records" } } }] });
  });

  it("refuses a field that asks to be encrypted, emitting no effect", async () => {
    const encrypted = { ...RECORD_OUTPUT, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", handling: "encrypt" }] } };
    const result = await execute({ records: ROWS }, { recordOutput: encrypted });
    const failure = { category: "graph_validation_or_unknown_node", code: "record_output.encrypt_unavailable", retryable: false };

    expect(result).toEqual({
      status: "failed",
      route: "failed",
      effects: [],
      outputs: { error: { code: "record_output.encrypt_unavailable", issues: expect.arrayContaining(["record_schema.encrypt_unavailable"]) } },
      message: expect.stringContaining("encrypt"),
      failure
    });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
  });

  it.each([
    ["absent", {}],
    ["null", { recordOutput: null }],
    ["false", { recordOutput: false }],
    ["a malformed schema", { recordOutput: { ...RECORD_OUTPUT, schema: { schemaVersion: "0.1", fields: "title" } } }],
    ["an unknown key", { recordOutput: { ...RECORD_OUTPUT, extra: true } }],
    ["a state binding", { recordOutput: { $state: { path: "extraction.output" } } }]
  ])("refuses a record output that is %s, emitting no effect", async (_case, parameters) => {
    const result = await execute({ records: ROWS }, parameters as Record<string, JsonValue>);

    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      effects: [],
      outputs: { error: { code: "record_output.invalid" } },
      failure: { category: "graph_validation_or_unknown_node", code: "record_output.invalid", retryable: false }
    });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });
});

// office run-mvgf04kw-310fc169 (t738): four values read one by one could not be
// saved as one row, because the rows came only through an input port no script
// line can connect. The records parameter takes the rows as written, each value
// bound to an earlier step's output, resolved when the node runs.
describe("builtin.data.write-records given its rows by the records parameter", () => {
  const ROW_OUTPUT = {
    datasetId: "account.plan",
    schema: { schemaVersion: "0.1", fields: [{ id: "plan", label: "Plan", valueType: "string" }, { id: "renews", label: "Renews", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] },
    writeMode: "replace"
  };
  const BOUND_ROWS: JsonValue = [{ plan: { $state: { path: "plan.value" } }, renews: { $state: { path: "renews.value" } }, price: { $state: { path: "price.value" } } }];
  const STATE: Record<string, JsonValue> = { plan: { value: "synthetic-plan" }, renews: { value: "synthetic-date" }, price: { value: "synthetic-price" } };

  it("declares a state-bindable list parameter for the rows, with no default, so a step leaves it out to use the input", () => {
    const parameter = writeRecordsNode.parameters.find((entry) => entry.id === "records");
    expect(parameter).toMatchObject({ id: "records", valueType: "array" });
    expect(parameter?.allowStateBinding).not.toBe(false);
    expect(parameter?.defaultValue).toBeUndefined();
    expect(parameter?.required).not.toBe(true);
  });

  it("writes one record holding the values the bindings resolved to", async () => {
    const resolved = resolveAutomationNodeParameterValues({ recordOutput: ROW_OUTPUT, records: BOUND_ROWS }, STATE);
    expect(resolved.missingPaths).toEqual([]);

    const result = await execute({}, resolved.values);

    expect(result).toEqual({
      status: "success",
      route: "success",
      outputs: {},
      effects: [{
        type: "records.write",
        payload: { recordOutput: { ...ROW_OUTPUT, recordsPath: "records" }, records: [{ plan: "synthetic-plan", renews: "synthetic-date", price: "synthetic-price" }] }
      }]
    });
  });

  it("takes the written rows over a bare records value another node left in run state", async () => {
    const result = await execute({ records: ROWS }, { recordOutput: ROW_OUTPUT, records: [{ plan: "synthetic-plan" }] });

    expect(result).toMatchObject({ status: "success", effects: [{ payload: { records: [{ plan: "synthetic-plan" }] } }] });
  });

  it("reports a binding the run cannot resolve as missing, so the node never runs on a row without it", () => {
    const resolved = resolveAutomationNodeParameterValues({ recordOutput: ROW_OUTPUT, records: BOUND_ROWS }, { plan: { value: "synthetic-plan" } });

    expect(resolved.missingPaths).toEqual(["renews.value", "price.value"]);
  });

  it("fails clearly, naming the field and emitting no effect, when a row still holds a binding nothing resolved", async () => {
    const result = await execute({}, { recordOutput: ROW_OUTPUT, records: BOUND_ROWS });

    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      effects: [],
      outputs: { error: { code: "record_output.unresolved_value", fields: ["plan", "renews", "price"] } },
      failure: { category: "graph_validation_or_unknown_node", code: "record_output.unresolved_value", retryable: false }
    });
    expect(result.message).toContain("plan");
    expect(JSON.stringify(result)).not.toContain("plan.value");
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });

  it.each([
    ["no rows at all", {}, {}, "record_output.no_records"],
    ["rows that are not a list of objects", {}, { records: ["synthetic"] }, "record_output.invalid_records"],
    ["rows that are one value", {}, { records: "synthetic" }, "record_output.invalid_records"]
  ])("fails clearly, emitting no effect, given %s", async (_case, inputs, parameters, code) => {
    const result = await execute(inputs as Record<string, JsonValue>, { recordOutput: ROW_OUTPUT, ...parameters } as Record<string, JsonValue>);

    expect(result).toMatchObject({ status: "failed", route: "failed", effects: [], outputs: { error: { code } }, failure: { code, retryable: false } });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });
});

async function execute(inputs: Record<string, JsonValue>, parameters: Record<string, JsonValue>): Promise<AutomationNodeExecutionResult> {
  const result = await writeRecordsNode.execute?.({ inputs, parameters });
  if (!result) throw new Error("builtin.data.write-records has no executor");
  return result;
}
