import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../index.ts";
import { captureAutomationStudioRecordBatch, captureAutomationStudioWrittenRecords } from "../record-capture.ts";

// Obviously synthetic: every assertion about these is where they must or must not travel.
const EXTRACTED = "synthetic-extracted-row-text";
const EXCLUDED = "synthetic-excluded-field-value";
const UNKNOWN = "synthetic-unknown-field-value";

const nameField: JsonObject = { id: "name", label: "Name", valueType: "string", required: true };
const priceField: JsonObject = { id: "price", label: "Price", valueType: "number" };
const schema: JsonObject = { schemaVersion: "0.1", fields: [nameField, priceField, { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }] };
const recordOutput: JsonObject = { datasetId: "products", recordsPath: "page.items", schema, writeMode: "append" };
const validatedRows = [{ name: EXTRACTED, price: 3 }, { name: "synthetic-second-row" }];

function effect(declared?: JsonValue | null): { type: string; payload: JsonObject } {
  const payload: JsonObject = { outputId: "extract-list", parameters: {} };
  if (declared !== undefined) payload.recordOutput = declared;
  return { type: "policy.output.dispatch", payload };
}

function extractedPayload(): JsonObject {
  return {
    page: {
      number: 2,
      items: [
        { name: EXTRACTED, price: 3, secret: EXCLUDED, extra: UNKNOWN },
        { price: 4, secret: EXCLUDED },
        { name: "synthetic-second-row" }
      ]
    },
    source: "synthetic-source"
  };
}

function answer(result: JsonValue | undefined): AutomationNodeExecutionResult {
  const outputs: Record<string, JsonValue> = { outputId: "extract-list", ok: true };
  if (result !== undefined) outputs.result = result;
  return { status: "success", route: "success", outputs };
}

function capture(declaredEffect: { type: string; payload?: JsonValue }, dispatched: AutomationNodeExecutionResult) {
  return captureAutomationStudioRecordBatch({ effect: declaredEffect, dispatched, nodeId: "extract", attemptId: "extract.attempt.1" });
}

describe("capturing the rows a record output declares", () => {
  it("writes the validated rows to records and hands them on in a batch with the stored schema", () => {
    const { result, batch } = capture(effect(recordOutput), answer(extractedPayload()));

    expect(result).toMatchObject({ status: "success", route: "success" });
    expect(result.outputs?.records).toEqual(validatedRows);
    expect(batch).toEqual({
      nodeId: "extract",
      attemptId: "extract.attempt.1",
      batchKey: "extract.attempt.1",
      datasetId: "products",
      writeMode: "append",
      schema: { schemaVersion: "0.1", fields: [nameField, priceField] },
      rows: validatedRows,
      invalidCount: 1,
      truncated: false
    });
  });

  it("leaves an excluded field and an unknown key out of records, result, and the batch", () => {
    const { result, batch } = capture(effect(recordOutput), answer(extractedPayload()));

    for (const held of [JSON.stringify(result.outputs), JSON.stringify(batch)]) {
      expect(held).not.toContain(EXCLUDED);
      expect(held).not.toContain(UNKNOWN);
    }
    expect(JSON.stringify(batch)).not.toContain("secret");
  });

  it("puts the same array back at recordsPath inside result, keeps the rest of result, and never changes the dispatcher's answer", () => {
    const dispatched = answer(extractedPayload());
    const before = structuredClone(dispatched);
    const { result, batch } = capture(effect(recordOutput), dispatched);
    const saved = result.outputs?.result as JsonObject;

    expect((saved.page as JsonObject).items).toBe(result.outputs?.records);
    expect(batch?.rows).toBe(result.outputs?.records);
    expect((saved.page as JsonObject).number).toBe(2);
    expect(saved.source).toBe("synthetic-source");
    expect(result.outputs).toMatchObject({ outputId: "extract-list", ok: true });
    expect(dispatched).toEqual(before);
  });

  it("carries the label and keeps no more rows than maxRecords, marking the batch truncated", () => {
    const { batch } = capture(effect({ ...recordOutput, label: "Products", maxRecords: 1 }), answer(extractedPayload()));

    expect(batch).toMatchObject({ label: "Products", rows: [{ name: EXTRACTED, price: 3 }], invalidCount: 0, truncated: true });
  });

  it.each([
    { case: "a string at the path", result: { page: { items: "synthetic-not-a-list" } } as JsonValue },
    { case: "nothing at the path", result: { page: {} } as JsonValue },
    { case: "an array on the way to the path", result: { page: [{ items: [] }] } as JsonValue },
    { case: "no payload at all", result: undefined }
  ])("fails with record_output.records_missing, capturing nothing, when there is $case", ({ result: payload }) => {
    const { result, batch } = capture(effect(recordOutput), answer(payload));
    const failure = { category: "output_not_observed", code: "record_output.records_missing", retryable: true };

    expect(batch).toBeUndefined();
    expect(result).toMatchObject({ status: "failed", route: "failed", message: "The output returned no list of records at page.items, so no records were saved." });
    expect(result.failure).toEqual(failure);
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    expect(result.outputs).not.toHaveProperty("records");
    if (payload === undefined) expect(result.outputs).not.toHaveProperty("result");
    else expect(result.outputs?.result).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
  });

  it("does not capture a failed dispatch, and withholds the payload it returned", () => {
    const failure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;
    const dispatched: AutomationNodeExecutionResult = { status: "failed", route: "failed", outputs: { ok: false, result: extractedPayload() }, message: "The list did not load.", failure };
    const { result, batch } = capture(effect(recordOutput), dispatched);

    expect(batch).toBeUndefined();
    expect(result).toEqual({ status: "failed", route: "failed", outputs: { ok: false, result: AUTOMATION_STUDIO_WITHHELD_VALUE }, message: "The list did not load.", failure });
    expect(JSON.stringify(result)).not.toContain(EXTRACTED);

    const withoutPayload: AutomationNodeExecutionResult = { status: "failed", route: "failed", outputs: { ok: false } };
    expect(capture(effect(recordOutput), withoutPayload).result).toBe(withoutPayload);
  });

  it.each([
    { case: "no recordOutput", declaredEffect: effect() },
    { case: "a null recordOutput", declaredEffect: effect(null) },
    { case: "another effect type", declaredEffect: { type: "records.write", payload: { recordOutput } } },
    { case: "a payload that is not an object", declaredEffect: { type: "policy.output.dispatch", payload: "synthetic-payload" } }
  ])("returns the dispatcher's answer by identity for $case", ({ declaredEffect }) => {
    const dispatched = answer(extractedPayload());
    const captured = capture(declaredEffect, dispatched);

    expect(captured.result).toBe(dispatched);
    expect(captured).not.toHaveProperty("batch");
  });

  it.each([
    { case: "asks to encrypt a field", declared: { ...recordOutput, schema: { schemaVersion: "0.1", fields: [{ ...nameField, handling: "encrypt" }] } } as JsonValue, code: "record_output.encrypt_unavailable" },
    { case: "has no recordsPath", declared: { datasetId: "products", schema, writeMode: "append" } as JsonValue, code: "record_output.invalid" },
    { case: "is false", declared: false as JsonValue, code: "record_output.invalid" }
  ])("fails after dispatch, capturing nothing and withholding the payload, when the effect's record output $case", ({ declared, code }) => {
    const { result, batch } = capture(effect(declared), answer(extractedPayload()));
    const failure = { category: "graph_validation_or_unknown_node", code, retryable: false, stage: "dispatch" };

    expect(batch).toBeUndefined();
    expect(result).toMatchObject({ status: "failed", route: "failed", outputs: { result: AUTOMATION_STUDIO_WITHHELD_VALUE, error: { code } } });
    expect(result.failure).toEqual(failure);
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    expect(result.outputs).not.toHaveProperty("records");
    expect(JSON.stringify(result)).not.toContain(EXTRACTED);
  });

  it("keys the batch by its enclosing Call Flow attempts, outermost first, then its own attempt, escaping so no two paths share a key", () => {
    const keyFor = (callFlowAttemptPath: string[], attemptId: string) =>
      captureAutomationStudioRecordBatch({ effect: effect(recordOutput), dispatched: answer(extractedPayload()), nodeId: "extract", attemptId, callFlowAttemptPath }).batch?.batchKey;

    expect(keyFor([], "extract.attempt.1")).toBe("extract.attempt.1");
    expect(keyFor(["call.attempt.2", "inner.attempt.1"], "extract.attempt.1")).toBe("call.attempt.2/inner.attempt.1/extract.attempt.1");
    expect(keyFor(["a/b"], "c.attempt.1")).toBe("a%2Fb/c.attempt.1");
    expect(keyFor(["a"], "b/c.attempt.1")).not.toBe(keyFor(["a/b"], "c.attempt.1"));
    expect(keyFor(["a%2Fb"], "c.attempt.1")).not.toBe(keyFor(["a/b"], "c.attempt.1"));
  });
});

describe("capturing the rows a records.write effect carries", () => {
  const writtenRows = (): JsonValue => (extractedPayload().page as JsonObject).items as JsonValue;
  const writeEffect = (payload?: JsonValue): { type: string; payload?: JsonValue } => payload === undefined ? { type: "records.write" } : { type: "records.write", payload };
  const write = (declaredEffect: { type: string; payload?: JsonValue }, callFlowAttemptPath?: string[]) =>
    captureAutomationStudioWrittenRecords({ effect: declaredEffect, nodeId: "write", attemptId: "write.attempt.1", ...(callFlowAttemptPath ? { callFlowAttemptPath } : {}) });

  it("validates the rows, writes them to records, keeps the same array in the effect, and hands them on in a batch", () => {
    const declared = writeEffect({ recordOutput, records: writtenRows() });
    const before = structuredClone(declared);
    const { result, effect: kept, batch } = write(declared);

    expect(result).toEqual({ status: "success", route: "success", outputs: { records: validatedRows } });
    expect(batch).toEqual({
      nodeId: "write",
      attemptId: "write.attempt.1",
      batchKey: "write.attempt.1",
      datasetId: "products",
      writeMode: "append",
      schema: { schemaVersion: "0.1", fields: [nameField, priceField] },
      rows: validatedRows,
      invalidCount: 1,
      truncated: false
    });
    expect(batch?.rows).toBe(result.outputs?.records);
    expect((kept.payload as JsonObject).records).toBe(result.outputs?.records);
    expect((kept.payload as JsonObject).recordOutput).toEqual(recordOutput);
    expect(declared).toEqual(before);
    for (const held of [JSON.stringify(result), JSON.stringify(kept), JSON.stringify(batch)]) {
      expect(held).not.toContain(EXCLUDED);
      expect(held).not.toContain(UNKNOWN);
    }
  });

  it.each([
    { case: "no recordsPath", declared: { datasetId: "products", schema, writeMode: "append" } as JsonValue },
    { case: "a recordsPath that is not a path", declared: { ...recordOutput, recordsPath: "not a path" } as JsonValue }
  ])("ignores the record output's recordsPath when it has $case", ({ declared }) => {
    expect(write(writeEffect({ recordOutput: declared, records: writtenRows() })).batch?.rows).toEqual(validatedRows);
  });

  it("keys the batch by its enclosing Call Flow attempts, as a dispatched batch is keyed", () => {
    expect(write(writeEffect({ recordOutput, records: writtenRows() }), ["call.attempt.2"]).batch?.batchKey).toBe("call.attempt.2/write.attempt.1");
  });

  it.each([
    { case: "a string", records: "synthetic-not-a-list" as JsonValue },
    { case: "an object", records: { items: writtenRows() } as JsonValue },
    { case: "absent", records: undefined }
  ])("fails with record_output.records_missing, capturing nothing and withholding what the effect carried, when records is $case", ({ records }) => {
    const declared = writeEffect(records === undefined ? { recordOutput } : { recordOutput, records });
    const { result, effect: kept, batch } = write(declared);
    const failure = { category: "graph_validation_or_unknown_node", code: "record_output.records_missing", retryable: false };

    expect(batch).toBeUndefined();
    expect(result).toEqual({ status: "failed", route: "failed", message: "No list of records was given to write, so no records were saved.", failure });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    if (records === undefined) expect(kept).toBe(declared);
    else expect((kept.payload as JsonObject).records).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(kept)).not.toContain(EXCLUDED);
  });

  it.each([
    { case: "asks to encrypt a field", declared: { ...recordOutput, schema: { schemaVersion: "0.1", fields: [{ ...nameField, handling: "encrypt" }] } } as JsonValue, code: "record_output.encrypt_unavailable" },
    { case: "is absent", declared: undefined, code: "record_output.invalid" },
    { case: "is false", declared: false as JsonValue, code: "record_output.invalid" }
  ])("fails, capturing nothing and withholding the rows, when the record output $case", ({ declared, code }) => {
    const { result, effect: kept, batch } = write(writeEffect(declared === undefined ? { records: writtenRows() } : { recordOutput: declared, records: writtenRows() }));
    const failure = { category: "graph_validation_or_unknown_node", code, retryable: false };

    expect(batch).toBeUndefined();
    expect(result).toMatchObject({ status: "failed", route: "failed", outputs: { error: { code } } });
    expect(result.failure).toEqual(failure);
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    expect((kept.payload as JsonObject).records).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(kept)).not.toContain(EXTRACTED);
  });

  it("withholds a payload that is not an object, and captures nothing", () => {
    const { result, effect: kept, batch } = write(writeEffect("synthetic-payload"));

    expect(batch).toBeUndefined();
    expect(kept.payload).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(result.failure?.code).toBe("record_output.invalid");
  });
});
