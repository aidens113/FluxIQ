// Binding through the framework's aliases (t1074, `../bind.ts`). Run run-mwyfx9fs-06a170bf declared its processing over
// the first read's own keys (0012), then made a read naming the request's columns its result (0059: `title` read from
// `link_text`, `store` from `text_6`, ...). The held declaration no longer bound: "Required fields: url_2 (missing),
// text_3 (missing), ..." in every request from 0067 to 0081, until the model declared it again. The read's own `fields`
// say which new column each old key became, so the framework rebinds through them.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../../schema.ts";
import { bindAutomationStudioRecordProcessing, processAutomationStudioRecordRows, stampAutomationStudioRecordProcessing } from "../../index.ts";

/** 0012's `process`, as sent (`steps/0012-tool-core.set_result_processing/call.json`). */
const D0012 = {
  derive: [{ id: "price_num", from: "price", as: "number" }, { id: "item_id", from: "url_2", pattern: "item/(\\d+)", as: "text" }],
  where: [{ field: "text_3", equals: "Free shipping" }, { field: "price_num", atMost: 10 }, { field: "text_7", is: "absent" }],
  dedupe: { by: ["item_id"] },
  sort: [{ field: "price_num", order: "asc", as: "number" }],
  columns: ["link_text", "text_6", "price", "number"]
};
/** 0059's read `fields`, as sent: each new column and the key it is read from. */
const FIELDS_0059: Record<string, string> = { title: "link_text", store: "text_6", price: "price", rating: "number", shipping: "text_3", ad: "text_7", link: "url_2" };
/** The keys 0059's rows hold: its named columns, then the keys it did not name. */
const SCHEMA_0059: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["title", "store", "price", "rating", "shipping", "ad", "link", "url", "image_src", "image_alt", "price_2", "text", "text_2", "text_4", "text_5"].map((id) => ({ id, label: id, valueType: "string" as const })) };
const ALIASES = Object.fromEntries(Object.entries(FIELDS_0059).map(([column, key]) => [key, column]));

describe("binding a held declaration through the read's renamed fields", () => {
  it("is refused without the aliases, naming the old keys (the run's 0067-0081)", () => {
    const bound = bindAutomationStudioRecordProcessing(D0012, SCHEMA_0059);
    expect(bound.ok).toBe(false);
    expect(!bound.ok && bound.unresolved.map((entry) => entry.field)).toEqual(expect.arrayContaining(["url_2", "text_3", "text_7", "link_text", "text_6", "number"]));
  });

  it("binds 0012's declaration unchanged to 0059's columns through the read's own fields", () => {
    const bound = stampAutomationStudioRecordProcessing(D0012, SCHEMA_0059, { source: "a".repeat(64), revision: 1 }, ALIASES);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.processing).toMatchObject({
      derive: [{ id: "price_num", from: "price" }, { id: "item_id", from: "link" }],
      where: [{ field: "shipping", equals: "Free shipping" }, { field: "price_num", atMost: 10 }, { field: "ad", is: "absent" }],
      columns: ["title", "store", "price", "rating"]
    });
    expect(bound.processing.declaration?.bindings).toMatchObject({ link_text: "title", text_6: "store", number: "rating", text_3: "shipping", text_7: "ad", url_2: "link" });
    const rows = [
      { title: "Hub A", store: "S1", price: "9,87 €", rating: "4.9", shipping: "Free shipping", ad: null, link: "/item/1" },
      { title: "Hub B", store: "S2", price: "8,10 €", rating: "4.1", shipping: "Free shipping", ad: "Ad", link: "/item/2" },
      { title: "Hub C", store: "S3", price: "7,00 €", rating: "4.5", shipping: "Free shipping", ad: null, link: "/item/3" }
    ];
    const processed = processAutomationStudioRecordRows({ rows: rows.map((values) => ({ values, nodeId: "read", batchKey: "b" })), schema: SCHEMA_0059, process: bound.processing, now: 0 });
    expect(processed.rows).toEqual([{ title: "Hub C", store: "S3", price: "7,00 €", rating: "4.5" }, { title: "Hub A", store: "S1", price: "9,87 €", rating: "4.9" }]);
  });

  it("tries an alias only after the exact id and a unique label, and only onto a stored field", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "kept", label: "Kept", valueType: "string" }, { id: "hidden", label: "Hidden", valueType: "string", handling: "exclude" }] };
    expect(bindAutomationStudioRecordProcessing({ columns: ["kept"] }, schema, { kept: "title" })).toMatchObject({ ok: true, processing: { columns: ["kept"] } });
    expect(bindAutomationStudioRecordProcessing({ columns: ["name"] }, schema, { name: "title" })).toMatchObject({ ok: true, processing: { columns: ["title"] } });
    expect(bindAutomationStudioRecordProcessing({ columns: ["name"] }, schema, { name: "nowhere" })).toMatchObject({ ok: false, unresolved: [{ field: "name", reason: "missing" }] });
    expect(bindAutomationStudioRecordProcessing({ columns: ["name"] }, schema, { name: "hidden" })).toMatchObject({ ok: false, unresolved: [{ field: "name", reason: "excluded" }] });
  });
});
