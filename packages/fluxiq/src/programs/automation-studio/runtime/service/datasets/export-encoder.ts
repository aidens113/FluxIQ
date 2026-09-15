import {
  encodeAutomationStudioRecordsCsvHeader,
  encodeAutomationStudioRecordsCsvRows,
  type AutomationStudioRecordSchema,
  type AutomationStudioRunDatasetExportFormat
} from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioRunDatasetRow } from "../../../storage/index.ts";

/** Turns a run dataset into export text a piece at a time. Every call depends only on its arguments. */
export type AutomationStudioRunDatasetExportEncoder = {
  format: AutomationStudioRunDatasetExportFormat;
  contentType: string;
  /** Text before the first row. */
  header(): string;
  /** The text of one row at its 0-based position in the body. */
  row(row: AutomationStudioRunDatasetRow, index: number): string;
  /** Text after the last row, given how many rows were written. */
  footer(rowCount: number): string;
  /** The most UTF-8 bytes `footer` returns, kept free before a row is accepted under a byte cap. */
  footerMaxBytes: number;
};

/**
 * The encoder for one export format over a stored schema. CSV uses the contract
 * encoders: RFC 4180, labels as headers, stored field ids only, formula cells
 * escaped. JSON is an array of row objects holding only the stored field ids, in
 * schema order.
 */
export function automationStudioRunDatasetExportEncoder(schema: AutomationStudioRecordSchema, format: AutomationStudioRunDatasetExportFormat): AutomationStudioRunDatasetExportEncoder {
  if (format === "csv") return csvEncoder(schema);
  if (format === "json") return jsonEncoder(schema);
  throw new Error("Invalid run dataset export format.");
}

function csvEncoder(schema: AutomationStudioRecordSchema): AutomationStudioRunDatasetExportEncoder {
  return {
    format: "csv",
    contentType: "text/csv; charset=utf-8",
    header: () => encodeAutomationStudioRecordsCsvHeader(schema),
    row: (row) => encodeAutomationStudioRecordsCsvRows(schema, [row]),
    footer: () => "",
    footerMaxBytes: 0
  };
}

function jsonEncoder(schema: AutomationStudioRecordSchema): AutomationStudioRunDatasetExportEncoder {
  const fieldIds = schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
  return {
    format: "json",
    contentType: "application/json; charset=utf-8",
    header: () => "[",
    row: (row, index) => `${index === 0 ? "\n" : ",\n"}${JSON.stringify(storedFields(row, fieldIds))}`,
    footer: (rowCount) => (rowCount === 0 ? "]" : "\n]"),
    footerMaxBytes: 2
  };
}

// An allowlist copy by the stored field ids, in schema order, so a key the
// schema does not declare is never written even if a row carries one.
function storedFields(row: AutomationStudioRunDatasetRow, fieldIds: readonly string[]): AutomationStudioRunDatasetRow {
  const stored: AutomationStudioRunDatasetRow = {};
  for (const id of fieldIds) {
    const value = Object.hasOwn(row, id) ? row[id] : undefined;
    if (value !== undefined) stored[id] = value;
  }
  return stored;
}
