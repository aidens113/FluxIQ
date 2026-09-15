import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  parseAutomationStudioRecordOutput,
  type AutomationStudioRecordOutput
} from "fluxiq/automation-studio/nodes";
import {
  addRecordField,
  deriveRecordFieldId,
  moveRecordField,
  newRecordOutputDraft,
  readRecordOutputDraft,
  removeRecordField,
  setRecordFieldHandling,
  setRecordPrimaryKey,
  toggleRecordOutput,
  updateRecordField,
  updateRecordOutputSettings
} from "../record-output-draft";

function sample(): AutomationStudioRecordOutput {
  return {
    datasetId: "products",
    label: "Products",
    recordsPath: "items",
    schema: {
      schemaVersion: "0.1",
      fields: [
        { id: "name", label: "Name", valueType: "string", required: true },
        { id: "price", label: "Price", valueType: "number" },
        { id: "email", label: "Email", valueType: "string" }
      ],
      primaryKey: ["name"]
    },
    writeMode: "append",
    maxRecords: 500
  };
}

const ids = (output: AutomationStudioRecordOutput) => output.schema.fields.map((field) => field.id);

describe("record output draft", () => {
  it("writes null when saving is turned off, and keeps or starts a draft when it is turned on", () => {
    expect(toggleRecordOutput(sample(), false)).toBeNull();
    expect(toggleRecordOutput(null, false)).toBeNull();
    expect(toggleRecordOutput(null, true)).toEqual(newRecordOutputDraft());
    expect(toggleRecordOutput(sample(), true)).toEqual(sample());
  });

  it("reads a stored value into fresh objects that still parse", () => {
    const stored = sample();
    const draft = readRecordOutputDraft(stored);
    expect(draft).toEqual(stored);
    expect(draft).not.toBe(stored);
    expect(draft?.schema).not.toBe(stored.schema);
    expect(draft?.schema.fields[0]).not.toBe(stored.schema.fields[0]);
    expect(parseAutomationStudioRecordOutput(draft).ok).toBe(true);
    expect(readRecordOutputDraft(null)).toBeNull();
    expect(readRecordOutputDraft(undefined)).toBeNull();
  });

  it("reads an unreadable value as an empty draft and writes no key the parser refuses", () => {
    expect(readRecordOutputDraft({ field: "", datasetId: 4, schema: "[truncated" })).toEqual(newRecordOutputDraft());
    const fresh = newRecordOutputDraft();
    expect(Object.keys(fresh)).toEqual(["datasetId", "recordsPath", "schema", "writeMode"]);
    const parsed = parseAutomationStudioRecordOutput(fresh);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.issues).toContain("record_schema.no_fields");
    expect(parsed.ok ? [] : parsed.issues).not.toContain("record_output.unknown_key");
  });

  it("keeps an excluded field in the schema with its handling", () => {
    const excluded = setRecordFieldHandling(sample(), 2, "exclude");
    expect(excluded.schema.fields).toHaveLength(3);
    expect(excluded.schema.fields[2]).toEqual({ id: "email", label: "Email", valueType: "string", handling: "exclude" });
    expect(parseAutomationStudioRecordOutput(excluded).ok).toBe(true);
    expect(setRecordFieldHandling(excluded, 2, "include").schema.fields[2]).toEqual({ id: "email", label: "Email", valueType: "string" });
  });

  it("clears the key when the key field stops being included", () => {
    expect(setRecordFieldHandling(sample(), 0, "exclude").schema.primaryKey).toBeUndefined();
    expect(setRecordFieldHandling(sample(), 1, "exclude").schema.primaryKey).toEqual(["name"]);
  });

  it("stops adding fields at the field limit, with unique names and ids", () => {
    const limit = AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields;
    let draft = updateRecordOutputSettings(newRecordOutputDraft(), { datasetId: "rows", recordsPath: "items" });
    for (let count = 0; count < limit + 5; count += 1) draft = addRecordField(draft);
    expect(draft.schema.fields).toHaveLength(limit);
    expect(new Set(ids(draft)).size).toBe(limit);
    expect(new Set(draft.schema.fields.map((field) => field.label)).size).toBe(limit);
    expect(addRecordField(draft)).toBe(draft);
    expect(parseAutomationStudioRecordOutput(draft).ok).toBe(true);
  });

  it("moves a field one step and preserves every other field", () => {
    const original = sample();
    const movedUp = moveRecordField(original, 2, -1);
    expect(movedUp.schema.fields).toEqual([original.schema.fields[0], original.schema.fields[2], original.schema.fields[1]]);
    expect(movedUp.schema.primaryKey).toEqual(["name"]);
    expect(ids(moveRecordField(original, 0, 1))).toEqual(["price", "name", "email"]);
    expect(moveRecordField(original, 0, -1)).toEqual(original);
    expect(moveRecordField(original, 2, 1)).toEqual(original);
  });

  it("clears the key when the key field is removed, and keeps it otherwise", () => {
    const withoutKeyField = removeRecordField(sample(), 0);
    expect(ids(withoutKeyField)).toEqual(["price", "email"]);
    expect(withoutKeyField.schema.primaryKey).toBeUndefined();
    const withoutPrice = removeRecordField(sample(), 1);
    expect(ids(withoutPrice)).toEqual(["name", "email"]);
    expect(withoutPrice.schema.primaryKey).toEqual(["name"]);
  });

  it("derives unique, valid ids from names", () => {
    expect(deriveRecordFieldId("Product name", [])).toBe("product_name");
    expect(deriveRecordFieldId("Product name", ["product_name"])).toBe("product_name_2");
    expect(deriveRecordFieldId("Product name", ["product_name", "product_name_2"])).toBe("product_name_3");
    expect(deriveRecordFieldId("  ***  ", [])).toBe("field");
    expect(deriveRecordFieldId("Constructor", [])).toBe("constructor_2");
    const long = deriveRecordFieldId("x".repeat(150), ["x".repeat(100)]);
    expect(long).toMatch(AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern);
    expect(long).toBe("x".repeat(98) + "_2");
  });

  it("renames the id with the name until the id is edited, and a renamed key stays the key", () => {
    let draft = addRecordField(newRecordOutputDraft());
    expect(draft.schema.fields[0]).toEqual({ id: "field_1", label: "Field 1", valueType: "string" });
    draft = updateRecordField(draft, 0, { label: "Price" });
    expect(draft.schema.fields[0]).toEqual({ id: "price", label: "Price", valueType: "string" });
    draft = updateRecordField(draft, 0, { id: "cost" });
    draft = updateRecordField(draft, 0, { label: "Unit price", valueType: "number", required: true });
    expect(draft.schema.fields[0]).toEqual({ id: "cost", label: "Unit price", valueType: "number", required: true });
    const renamedKey = updateRecordField(sample(), 0, { label: "Title" });
    expect(renamedKey.schema.fields[0]?.id).toBe("title");
    expect(renamedKey.schema.primaryKey).toEqual(["title"]);
  });

  it("sets a single key and writes settings by name, removing cleared optional settings", () => {
    expect(setRecordPrimaryKey(sample(), "price").schema.primaryKey).toEqual(["price"]);
    expect(setRecordPrimaryKey(sample(), null).schema.primaryKey).toBeUndefined();
    const cleared = updateRecordOutputSettings(sample(), { label: " ", maxRecords: null, writeMode: "replace" });
    expect(Object.keys(cleared)).toEqual(["datasetId", "recordsPath", "schema", "writeMode"]);
    expect(cleared.writeMode).toBe("replace");
    expect(updateRecordOutputSettings(sample(), { maxRecords: 20 }).maxRecords).toBe(20);
  });
});
