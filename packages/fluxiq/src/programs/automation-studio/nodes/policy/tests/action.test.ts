import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../contracts.ts";
import { actionNode } from "../action.ts";

const PARAMETERS: Record<string, JsonValue> = {
  outputId: "output.extract",
  parameters: { selector: "#list" },
  confirmationInputId: "",
  confirmationTimeoutMs: 5000,
  timeoutMs: 3000,
  requiresApproval: false,
  failureRoute: "failed"
};

// The dispatch payload exactly as the node wrote it before record outputs existed.
const PAYLOAD_WITHOUT_RECORD_OUTPUT = "{\"outputId\":\"output.extract\",\"parameters\":{\"selector\":\"#list\"},\"confirmationInputId\":\"\",\"confirmationTimeoutMs\":5000,\"timeoutMs\":3000,\"requiresApproval\":false,\"failureRoute\":\"failed\"}";

const RECORD_OUTPUT = {
  datasetId: "catalog.products",
  label: "Products",
  recordsPath: "extracted.items",
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

describe("builtin.policy.action", () => {
  it("declares a records data port after success and failed", () => {
    expect(actionNode.outputs.map((port) => port.id)).toEqual(["success", "failed", "records"]);
    expect(actionNode.outputs.find((port) => port.id === "records")).toEqual({ id: "records", label: "Records", valueType: "array", role: "data" });
  });

  it("declares recordOutput as a manual-only json parameter, defaulting to null, edited by the record-output control", () => {
    const parameter = actionNode.parameters.find((entry) => entry.id === "recordOutput");

    expect(parameter).toMatchObject({ label: "Save extracted records", valueType: "json", defaultValue: null });
    expect(parameter?.allowStateBinding).toBe(false);
    expect(parameter?.ui).toEqual({ control: "record-output" });
  });

  it.each([
    ["absent", {}],
    ["null", { recordOutput: null }]
  ])("dispatches the unchanged payload, with no recordOutput key, when recordOutput is %s", async (_case, extra) => {
    const result = await execute({ ...PARAMETERS, ...extra });
    const payload = dispatchPayload(result);

    expect(result).toMatchObject({ status: "success", route: "success", outputs: { success: true } });
    expect(JSON.stringify(payload)).toBe(PAYLOAD_WITHOUT_RECORD_OUTPUT);
    expect(Object.hasOwn(payload, "recordOutput")).toBe(false);
  });

  it("carries a valid recordOutput, as the parser returned it, in the dispatch payload", async () => {
    const result = await execute({ ...PARAMETERS, recordOutput: RECORD_OUTPUT });
    const payload = dispatchPayload(result);

    expect(result).toMatchObject({ status: "success", route: "success", outputs: { success: true } });
    expect(payload).toEqual({ ...JSON.parse(PAYLOAD_WITHOUT_RECORD_OUTPUT), recordOutput: RECORD_OUTPUT });
    expect(payload.recordOutput).not.toBe(RECORD_OUTPUT);
  });

  it("fails before dispatch with no effect when a field asks to be encrypted, even with the success failure route", async () => {
    const encrypted = { ...RECORD_OUTPUT, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", handling: "encrypt" }] } };
    const result = await execute({ ...PARAMETERS, failureRoute: "success", recordOutput: encrypted });

    expect(result).toEqual({
      status: "failed",
      route: "failed",
      effects: [],
      outputs: { error: { code: "record_output.encrypt_unavailable", issues: expect.arrayContaining(["record_schema.encrypt_unavailable"]) } },
      message: expect.stringContaining("encrypt"),
      failure: { category: "graph_validation_or_unknown_node", code: "record_output.encrypt_unavailable", retryable: false, stage: "dispatch" }
    });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });

  const { recordsPath: _recordsPath, ...withoutRecordsPath } = RECORD_OUTPUT;
  it.each([
    ["a malformed schema", { ...RECORD_OUTPUT, schema: { schemaVersion: "0.1", fields: "title" } }],
    ["no recordsPath", withoutRecordsPath],
    ["an unknown key", { ...RECORD_OUTPUT, extra: true }],
    ["a state binding", { $state: { path: "extraction.output" } }],
    ["an empty object", {}],
    ["false", false],
    ["zero", 0],
    ["an empty string", ""],
    ["an array", [RECORD_OUTPUT]]
  ])("fails before dispatch with no effect when recordOutput is %s", async (_case, recordOutput) => {
    const result = await execute({ ...PARAMETERS, recordOutput: recordOutput as JsonValue });

    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      effects: [],
      outputs: { error: { code: "record_output.invalid" } },
      failure: { category: "graph_validation_or_unknown_node", code: "record_output.invalid", retryable: false, stage: "dispatch" }
    });
    expect(result.message).toEqual(expect.any(String));
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });
});

async function execute(parameters: Record<string, JsonValue>): Promise<AutomationNodeExecutionResult> {
  const result = await actionNode.execute?.({ inputs: { ready: true }, parameters });
  if (!result) throw new Error("builtin.policy.action has no executor");
  return result;
}

function dispatchPayload(result: AutomationNodeExecutionResult): Record<string, JsonValue> {
  expect(result.effects).toHaveLength(1);
  const effect = result.effects?.[0];
  expect(effect?.type).toBe("policy.output.dispatch");
  const payload = effect?.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("dispatch payload is not an object");
  return payload;
}
