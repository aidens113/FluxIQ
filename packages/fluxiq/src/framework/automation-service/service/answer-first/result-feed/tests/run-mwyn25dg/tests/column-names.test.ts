// The data stage names the result's fields by evidence it holds (t1074, `../column-names.ts`, `../asked-view.ts`).
// - Run run-mwyn25dg-3ba0b41c: the request named "title, price, bids and postage", the rows held the read's own keys, and
//   the answer was refused as not the asked table (0087) until the list was read again under those names. Rows below
//   are six of the run's recorded 46 (`steps/0012-*/result.json`), with the keys its declaration named.
// - Run run-mwyfx9fs-06a170bf: the declaration over the first read's keys (0012) no longer bound once the result moved to
//   a read naming the request's columns (0059); the read's own `fields` say which key each column is read from.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordCollectedRow, AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../../../../core/index.ts";
import { automationStudioAnswerFirstDataStage } from "../../../stage.ts";

const NOW = Date.UTC(2026, 8, 21, 12);
const declaration = (process: JsonObject) => ({ version: 1 as const, source: "a".repeat(64), revision: 1, task: { process } });
const schemaOf = (ids: readonly string[]): AutomationStudioRecordSchema => ({ schemaVersion: "0.1", fields: ids.map((id) => ({ id, label: id, valueType: "string" as const })) });
const collected = (rows: readonly JsonObject[], ids: readonly string[]): AutomationStudioRecordCollectedRow[] => rows.map((values) => ({ values, nodeId: "read_p1", batchKey: "read_p1", captured: [...ids] }));

const KEYS = ["data-listingid", "link_text", "text_2", "price", "text_4", "text_5", "text_8", "text_9"];
const ROW = (id: string, link_text: string, text_2: string, price: string, text_4: string | null, text_5: string, text_8: string, text_9: string): JsonObject => ({ "data-listingid": id, link_text, text_2, price, text_4, text_5, text_8, text_9 });
const KESTREL = [
  ROW("1", "Kestrel 35S rangefinder camera, 40mm f/1.7", "Pre-owned", "£88.00", null, "9 bids", "(Tue 22 Sep, 14:00)", "+£5.20 postage"),
  ROW("2", "Kestrel 35 Rangefinder Camera", "Pre-owned", "£64.00", null, "11 bids", "(Mon 21 Sep, 15:35)", "+£4.95 postage"),
  ROW("3", "KESTREL 35 45mm f/2.8 Voss-Anastigmat — film tested, new seals", "Pre-owned", "EUR 109,00", "approx. £94.60", "6 bids", "(Mon 21 Sep, 19:12)", "+EUR 14,50 postage"),
  ROW("4", "Original lens cap for Kestrel 35", "Pre-owned", "£9.50", null, "6 bids", "(Mon 21 Sep, 16:30)", "+£1.50 postage"),
  ROW("5", "Kestrel 35 for spares or repair, shutter jammed", "For parts or not working", "£12.50", null, "5 bids", "(Tue 22 Sep, 01:40)", "+£3.50 postage"),
  ROW("6", "Kestrel 35, early serial 10xxx, beautiful", "Pre-owned", "EUR 175,00", "approx. £151.88", "8 bids", "(Tue 22 Sep, 15:00)", "+EUR 18,00 postage")
];
/** 0049's `process` as sent, its title exclusions shortened to the ones these rows need. */
const D0049 = {
  where: [
    { field: "text_5", matches: "bids?$" },
    { field: "text_2", equals: "For parts or not working", not: true },
    { field: "link_text", matches: "kestrel 35" },
    { field: "link_text", matches: "35 ?-?s\\b|35s|lens cap", not: true }
  ],
  anyOf: [[{ field: "price", matches: "^£(\\d{1,2}|1[0-4]\\d)\\.\\d\\d$" }], [{ field: "text_4", matches: "^approx\\. £(\\d{1,2}|1[0-4]\\d)\\.\\d\\d$" }]],
  sort: [{ field: "text_8", order: "asc", as: "date" }],
  columns: ["link_text", "price", "text_5", "text_9"]
};
const ASKED = ["title", "price", "bids", "postage"];

describe("the data stage names fields by evidence (t1074)", () => {
  it("answers run-mwyn25dg's 0049 as the asked table: its rows kept, its columns under the request's names", () => {
    const stage = automationStudioAnswerFirstDataStage(declaration(D0049 as unknown as JsonObject), NOW);
    const result = stage.evaluate({ schema: schemaOf(KEYS), rows: collected(KESTREL, KEYS), columns: [], askedColumns: ASKED });
    expect(result.readiness).toEqual({ state: "ready" });
    expect(result.summary?.columns.map((column) => column.id)).toEqual(ASKED);
    expect(result.summary?.rows).toEqual([
      { "data-listingid": "2", title: "Kestrel 35 Rangefinder Camera", text_2: "Pre-owned", price: "£64.00", text_4: null, bids: "11 bids", text_8: "(Mon 21 Sep, 15:35)", postage: "+£4.95 postage" },
      { "data-listingid": "3", title: "KESTREL 35 45mm f/2.8 Voss-Anastigmat — film tested, new seals", text_2: "Pre-owned", price: "EUR 109,00", text_4: "approx. £94.60", bids: "6 bids", text_8: "(Mon 21 Sep, 19:12)", postage: "+EUR 14,50 postage" }
    ]);
    expect(result.summary?.schema?.fields.map((field) => field.id)).toEqual(["data-listingid", "title", "text_2", "price", "text_4", "bids", "text_8", "postage"]);
    expect(stage.naming()?.text).toBe("The request's columns on these rows: title is link_text (the declaration's order), price is price, bids is text_5 (its values name it), postage is text_9 (its values name it). The answer shows each under the request's name, and processing may name either.");
  });

  it("binds a declaration that names the request's columns and lets the declaration's order place the one evidence cannot", () => {
    const named = { ...D0049, where: [...D0049.where.slice(0, 1).map((entry) => ({ ...entry, field: "bids" })), ...D0049.where.slice(1)], columns: ["link_text", "price", "bids", "postage"] };
    const stage = automationStudioAnswerFirstDataStage(declaration(named as unknown as JsonObject), NOW);
    const result = stage.evaluate({ schema: schemaOf(KEYS), rows: collected(KESTREL, KEYS), columns: [], askedColumns: ASKED });
    expect(result.readiness).toEqual({ state: "ready" });
    expect(result.processing?.where?.[0]?.field).toBe("text_5");
    expect(result.summary?.columns.map((column) => column.id)).toEqual(ASKED);
  });

  it("says which request column no field is known to hold when the declaration does not place it", () => {
    const stage = automationStudioAnswerFirstDataStage(declaration({ where: D0049.where, anyOf: D0049.anyOf } as unknown as JsonObject), NOW);
    const result = stage.evaluate({ schema: schemaOf(KEYS), rows: collected(KESTREL, KEYS), columns: [], askedColumns: ASKED });
    expect(result.readiness).toMatchObject({ state: "missing-evidence", code: "answer_first.processing_binding_missing" });
    expect(result.readiness.state === "missing-evidence" && result.readiness.reason).toContain("No field is known to hold title: list columns in the request's order, or name the field that holds each.");
  });

  it("rebinds run-mwyfx9fs's held 0012 declaration through 0059's renamed fields", () => {
    const d0012 = {
      derive: [{ id: "price_num", from: "price", as: "number" }, { id: "item_id", from: "url_2", pattern: "item/(\\d+)", as: "text" }],
      where: [{ field: "text_3", equals: "Free shipping" }, { field: "price_num", atMost: 10 }, { field: "text_7", is: "absent" }],
      dedupe: { by: ["item_id"] },
      sort: [{ field: "price_num", order: "asc", as: "number" }],
      columns: ["link_text", "text_6", "price", "number"]
    };
    const ids = ["title", "store", "price", "rating", "shipping", "ad", "link", "url"];
    const rows: JsonObject[] = [
      { title: "Hub A", store: "S1", price: "9,87 €", rating: "4.9", shipping: "Free shipping", ad: null, link: "/item/1", url: "/item/1" },
      { title: "Hub B", store: "S2", price: "8,10 €", rating: "4.1", shipping: "Free shipping", ad: "Ad", link: "/item/2?src=ad", url: "/item/2?src=ad" },
      { title: "Hub C", store: "S3", price: "17,00 €", rating: "4.5", shipping: "Free shipping", ad: null, link: "/item/3", url: "/item/3" }
    ];
    const renamed: Record<string, string> = { link_text: "title", text_6: "store", number: "rating", text_3: "shipping", text_7: "ad", url_2: "link" };
    const stage = automationStudioAnswerFirstDataStage(declaration(d0012 as unknown as JsonObject), NOW);
    const before = stage.evaluate({ schema: schemaOf(ids), rows: collected(rows, ids), columns: [], askedColumns: ["title", "store", "price", "rating"] });
    expect(before.readiness).toMatchObject({ state: "missing-evidence", code: "answer_first.processing_binding_missing" });
    const after = stage.evaluate({ schema: schemaOf(ids), rows: collected(rows, ids), columns: [], askedColumns: ["title", "store", "price", "rating"], renamed });
    expect(after.readiness).toEqual({ state: "ready" });
    expect(after.summary?.rows.map((row) => (row as Record<string, JsonValue>).title)).toEqual(["Hub A"]);
    expect(after.summary?.columns.map((column) => column.id)).toEqual(["title", "store", "price", "rating"]);
  });
});
