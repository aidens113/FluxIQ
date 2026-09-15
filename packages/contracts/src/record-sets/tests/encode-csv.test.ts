import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../core.ts";
import {
  encodeAutomationStudioRecordsCsvHeader,
  encodeAutomationStudioRecordsCsvRows,
  type AutomationStudioRecordSchema
} from "../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "number" },
    { id: "session", label: "Session", valueType: "string", handling: "exclude" },
    { id: "link", label: "Link", valueType: "url" },
    { id: "listed", label: "Listed", valueType: "datetime" },
    { id: "details", label: "Details", valueType: "json" },
    { id: "in_stock", label: "In stock", valueType: "boolean" }
  ]
};

const TITLE_ONLY: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] };

function titleCell(title: string): string {
  return encodeAutomationStudioRecordsCsvRows(TITLE_ONLY, [{ title }]);
}

describe("encodeAutomationStudioRecordsCsvHeader", () => {
  it("uses labels for the stored columns only, ending in CRLF", () => {
    expect(encodeAutomationStudioRecordsCsvHeader(SCHEMA)).toBe("Title,Price,Link,Listed,Details,In stock\r\n");
  });

  it("quotes and escapes labels like any string cell", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "a", label: "Price, USD", valueType: "number" }, { id: "b", label: "=cmd", valueType: "string" }] };
    expect(encodeAutomationStudioRecordsCsvHeader(schema)).toBe("\"Price, USD\",'=cmd\r\n");
  });
});

describe("encodeAutomationStudioRecordsCsvRows", () => {
  it("quotes cells holding quotes, commas, and newlines (RFC 4180)", () => {
    expect(titleCell("He said \"hi\", then\nleft")).toBe("\"He said \"\"hi\"\", then\nleft\"\r\n");
    expect(titleCell("line\r\nbreak")).toBe("\"line\r\nbreak\"\r\n");
    expect(titleCell("plain")).toBe("plain\r\n");
  });

  it("prefixes string cells that start a formula", () => {
    expect(titleCell("=1+1")).toBe("'=1+1\r\n");
    expect(titleCell("+1")).toBe("'+1\r\n");
    expect(titleCell("-1")).toBe("'-1\r\n");
    expect(titleCell("@SUM(A1)")).toBe("'@SUM(A1)\r\n");
    expect(titleCell("\tcmd")).toBe("'\tcmd\r\n");
    expect(titleCell("\rcmd")).toBe("\"'\rcmd\"\r\n");
    expect(titleCell("a=1")).toBe("a=1\r\n");
  });

  it("never prefixes number or boolean cells, and prefixes json cells", () => {
    const rows: JsonObject[] = [{ price: -5, in_stock: false, details: -3 }, { price: 1.25, in_stock: true, details: { a: "x,y" } }];
    expect(encodeAutomationStudioRecordsCsvRows(SCHEMA, rows)).toBe(",-5,,,'-3,false\r\n,1.25,,,\"{\"\"a\"\":\"\"x,y\"\"}\",true\r\n");
  });

  it("leaves an ordinary datetime alone and escapes one that Date.parse accepts with a formula lead", () => {
    expect(Number.isNaN(Date.parse("@SUM(1) 2020"))).toBe(false);
    expect(encodeAutomationStudioRecordsCsvRows(SCHEMA, [{ listed: "2026-09-15T10:00:00Z" }, { listed: "@SUM(1) 2020" }])).toBe(",,,2026-09-15T10:00:00Z,,\r\n,,,'@SUM(1) 2020,,\r\n");
  });

  it("never writes a column missing from the schema, and writes a missing or null value as an empty cell", () => {
    const text = encodeAutomationStudioRecordsCsvRows(SCHEMA, [{ title: "Lamp", session: "secret-cookie", unknown: "stray-value", link: null }]);
    expect(text).toBe("Lamp,,,,,\r\n");
    expect(text).not.toContain("secret-cookie");
    expect(text).not.toContain("stray-value");
  });

  it("writes one CRLF-terminated line per row and nothing for no rows", () => {
    expect(encodeAutomationStudioRecordsCsvRows(TITLE_ONLY, [{ title: "a" }, { title: "b" }])).toBe("a\r\nb\r\n");
    expect(encodeAutomationStudioRecordsCsvRows(TITLE_ONLY, [])).toBe("");
  });
});
