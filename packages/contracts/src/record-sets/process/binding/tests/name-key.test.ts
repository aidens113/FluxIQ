// A declaration naming a column by the site's detected key binds the column the page labels in words (t999): in
// binding only, `_` and `-` separate words as spaces do. Exact ids still win, a match must still be unique, an
// exclusion still refuses, and cell values still compare by their own text.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../../schema.ts";
import { automationStudioRecordConditionHolds, bindAutomationStudioRecordProcessing } from "../../index.ts";
import { automationStudioRecordBindingNameKey } from "../name-key.ts";

// A generic listing of rentals, as a downstream read stores it: the model's ids, the page's words as labels.
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
  { id: "title", label: "Title", valueType: "string" },
  { id: "host", label: "Superhost Badge", valueType: "string", mark: "badge" },
  { id: "rate", label: "nightly-rate", valueType: "string" },
  { id: "note", label: "Private Note", valueType: "string", handling: "exclude" }
] };

describe("binding a written name to a worded label across word separators", () => {
  it.each(["superhost_badge", "superhost-badge", "Superhost-Badge", "SUPERHOST  badge", "superhost__badge"])("binds %s to the worded label", (written) => {
    expect(bindAutomationStudioRecordProcessing({ where: [{ field: written, is: "present" }] }, SCHEMA)).toMatchObject({
      ok: true, processing: { where: [{ field: "host", is: "present" }] }, bindings: { [written]: "host" }
    });
  });

  it("binds a worded name to a label written as a key", () => {
    expect(bindAutomationStudioRecordProcessing({ where: [{ field: "nightly_rate", is: "present" }], columns: ["title", "Nightly rate"] }, SCHEMA))
      .toMatchObject({ ok: true, processing: { where: [{ field: "rate", is: "present" }], columns: ["title", "rate"] } });
  });

  it("keeps an exact id ahead of a label that matches it across separators", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
      { id: "plus_badge", label: "Rating", valueType: "string" },
      { id: "plus", label: "Plus Badge", valueType: "string" }
    ] };
    expect(bindAutomationStudioRecordProcessing({ columns: ["plus_badge", "plus-badge"] }, schema)).toMatchObject({
      ok: true, processing: { columns: ["plus_badge", "plus"] }, bindings: { plus_badge: "plus_badge", "plus-badge": "plus" }
    });
  });

  it("refuses two labels that collide once separators are read as spaces", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
      { id: "first", label: "unit_price", valueType: "string" },
      { id: "second", label: "Unit Price", valueType: "string" }
    ] };
    expect(bindAutomationStudioRecordProcessing({ sort: [{ field: "unit-price", order: "asc" }] }, schema))
      .toMatchObject({ ok: false, unresolved: [{ field: "unit-price", reason: "ambiguous" }] });
  });

  it("keeps an exclusion authoritative when named across separators", () => {
    expect(bindAutomationStudioRecordProcessing({ columns: ["private_note"] }, SCHEMA))
      .toMatchObject({ ok: false, unresolved: [{ field: "private_note", reason: "excluded" }] });
  });

  it("does not bind a name whose words differ", () => {
    expect(bindAutomationStudioRecordProcessing({ columns: ["superhostbadge"] }, SCHEMA))
      .toMatchObject({ ok: false, unresolved: [{ field: "superhostbadge", reason: "missing" }] });
  });

  it("reads `_`, `-` and runs of spaces alike, and nothing else", () => {
    expect(automationStudioRecordBindingNameKey("  Data-Ad_ID  ")).toBe("data ad id");
    expect(automationStudioRecordBindingNameKey("price.usd")).toBe("price.usd");
  });
});

describe("cell values compare by their own text", () => {
  it("still needs the `_` for a `contains` over a cell that holds one", () => {
    expect(automationStudioRecordConditionHolds({ contains: "ear_tips" }, "Replacement ear_tips, medium")).toBe(true);
    expect(automationStudioRecordConditionHolds({ contains: "ear tips" }, "Replacement ear_tips, medium")).toBe(false);
    expect(automationStudioRecordConditionHolds({ equals: "in-stock" }, "in stock")).toBe(false);
  });
});
