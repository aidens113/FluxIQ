import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordField } from "fluxiq/automation-studio/nodes";
import { recordOutputParameterError } from "../record-output-issues";

function output(fields: AutomationStudioRecordField[]) {
  return {
    datasetId: "products",
    recordsPath: "items",
    schema: { schemaVersion: "0.1", fields },
    writeMode: "append"
  };
}

describe("recordOutputParameterError", () => {
  it("gives no error when saving is off or the value is valid", () => {
    expect(recordOutputParameterError(null)).toBeNull();
    expect(recordOutputParameterError(undefined)).toBeNull();
    expect(recordOutputParameterError(output([{ id: "name", label: "Name", valueType: "string" }]))).toBeNull();
    expect(recordOutputParameterError(output([
      { id: "name", label: "Name", valueType: "string" },
      { id: "email", label: "Email", valueType: "string", handling: "exclude" }
    ]))).toBeNull();
  });

  it("explains that Encrypt column is not available yet", () => {
    expect(recordOutputParameterError(output([{ id: "card", label: "Card", valueType: "string", handling: "encrypt" }])))
      .toBe("Encrypt column is not available yet: it arrives with project record keys. Choose Include or Exclude column.");
  });

  it("names a duplicate field id in plain words", () => {
    expect(recordOutputParameterError(output([
      { id: "name", label: "Name", valueType: "string" },
      { id: "name", label: "Title", valueType: "string" }
    ]))).toBe("Two fields have the same id. Field ids must be unique.");
  });

  it("asks for a missing or empty records path", () => {
    const { recordsPath: _omitted, ...withoutPath } = output([{ id: "name", label: "Name", valueType: "string" }]);
    expect(recordOutputParameterError(withoutPath)).toBe("Enter the records path: where the list of rows sits inside the node's result.");
    expect(recordOutputParameterError({ ...withoutPath, recordsPath: "" })).toContain("Enter the records path");
  });

  it("flags values the policy action refuses, without showing raw issue codes", () => {
    for (const value of ["", false, 0, {}, [], { $state: { path: "app.schema" } }]) {
      const error = recordOutputParameterError(value);
      expect(error).not.toBeNull();
      expect(error).not.toContain("record_");
    }
  });
});
