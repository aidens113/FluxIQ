import {
  encodeAutomationStudioRecordsCsvHeader,
  encodeAutomationStudioRecordsCsvRows,
  type AutomationStudioRecordSchema,
  type AutomationStudioRunDatasetExportFormat
} from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import { automationStudioRunDatasetExportEncoder } from "../export-encoder.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "session", label: "Session", valueType: "string", handling: "exclude" },
    { id: "price", label: "Price", valueType: "number" }
  ]
};

describe("automationStudioRunDatasetExportEncoder", () => {
  it("encodes CSV with the contract encoders and no footer", () => {
    const encoder = automationStudioRunDatasetExportEncoder(SCHEMA, "csv");
    const row = { title: "=SUM(1)", price: 2 };
    expect(encoder).toMatchObject({ format: "csv", contentType: "text/csv; charset=utf-8", footerMaxBytes: 0 });
    expect(encoder.header()).toBe(encodeAutomationStudioRecordsCsvHeader(SCHEMA));
    expect(encoder.row(row, 4)).toBe(encodeAutomationStudioRecordsCsvRows(SCHEMA, [row]));
    expect(encoder.footer(3)).toBe("");
  });

  it("encodes JSON as an array holding only the stored field ids, in schema order", () => {
    const encoder = automationStudioRunDatasetExportEncoder(SCHEMA, "json");
    expect(encoder).toMatchObject({ format: "json", contentType: "application/json; charset=utf-8" });
    const row = { price: 2, extra: "not in the schema", session: "excluded", title: "Chair" };
    expect(encoder.row(row, 0)).toBe("\n{\"title\":\"Chair\",\"price\":2}");
    expect(encoder.row({ title: "Lamp" }, 1)).toBe(",\n{\"title\":\"Lamp\"}");
    const text = encoder.header() + encoder.row(row, 0) + encoder.row({ title: "Lamp" }, 1) + encoder.footer(2);
    expect(JSON.parse(text)).toEqual([{ title: "Chair", price: 2 }, { title: "Lamp" }]);
    expect(encoder.header() + encoder.footer(0)).toBe("[]");
    expect(Math.max(Buffer.byteLength(encoder.footer(0)), Buffer.byteLength(encoder.footer(5)))).toBe(encoder.footerMaxBytes);
  });

  it("refuses any other format", () => {
    expect(() => automationStudioRunDatasetExportEncoder(SCHEMA, "xml" as AutomationStudioRunDatasetExportFormat)).toThrow("Invalid run dataset export format.");
  });
});
