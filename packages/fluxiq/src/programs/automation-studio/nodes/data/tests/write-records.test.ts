import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../contracts.ts";
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
  it("declares a records input, a records data output, and a manual-only record output edited by the record-output control", () => {
    expect(writeRecordsNode.inputs.find((port) => port.id === "records")).toMatchObject({ valueType: "array", required: true });
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

async function execute(inputs: Record<string, JsonValue>, parameters: Record<string, JsonValue>): Promise<AutomationNodeExecutionResult> {
  const result = await writeRecordsNode.execute?.({ inputs, parameters });
  if (!result) throw new Error("builtin.data.write-records has no executor");
  return result;
}
