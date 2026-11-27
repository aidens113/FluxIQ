// A refused `core.set_result_processing` says which part is refused and why (t1070). Run `run-mwyg0x66-4d561a42`
// sent the declaration below (step 0061, exactly) and fourteen like it, and each was answered
// `said: "record_output.process_invalid_condition. "` and nothing else (`steps/0061-.../result.json`), so the model
// could not tell that a `matches` beginning `(?i)` is not JavaScript, nor that one pattern was over the length a
// pattern may have.
import { expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automaticFeed } from "../../result-feed/tests/automatic-support.ts";
import { automationStudioAnswerFirstAmendProcessing } from "../amend.ts";

const STEP_0061: JsonObject = {
  derive: [
    { id: "gbp", from: "price", pattern: "^£([0-9,.]+)", as: "number" },
    { id: "approx_gbp", from: "text_4", pattern: "approx\\. £([0-9,.]+)", as: "number" },
    { id: "bidn", from: "text_5", pattern: "^([0-9]+) bid", as: "number" },
    { id: "endt", from: "text_8", pattern: "\\((.*)\\)", as: "text" }
  ],
  where: [
    { field: "text_2", contains: "For parts", not: true },
    { field: "bidn", atLeast: 0 },
    { field: "link_text", matches: "(?i)^(new listing)?kestrel 35\\b" },
    { field: "link_text", matches: "(?i)^(?!.*(35\\s?-?s\\b|mk\\.?\\s?(ii|2)|mark 2|\\b350\\b|50 deluxe|lens only|case only|box only|manual|strap|flashgun|hood|filter|lens cap|self-timer|selbstausl|pair|job lot|spares|dummy|untested|not working|half case|boxed.*3 lenses))" }
  ],
  anyOf: [[{ field: "gbp", lessThan: 150 }], [{ field: "approx_gbp", lessThan: 150 }]],
  dedupe: { by: ["link_text", "text_8"] },
  sort: [{ field: "endt", order: "asc", as: "date" }],
  columns: ["link_text", "price", "text_5", "text_9"]
};
const WHY = "Request excludes 35S, Mk II, 350, accessories, parts, and bids at or above £150 using the site's £ estimate; sort soonest-ending.";

/** The fields the run's read retained (the bindings steps 0059 and 0063 were answered with). */
const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: ["link_text", "price", "text_2", "text_4", "text_5", "text_8", "text_9", "url_2"].map((id) => ({ id, label: id, valueType: "string" as const }))
};
const ROWS: JsonObject[] = [
  { link_text: "Kestrel 35 rangefinder", price: "£80.00", text_2: "Used", text_4: "", text_5: "3 bids", text_8: "(Sat, 10:00)", text_9: "£4.00 postage", url_2: "/itm/1" },
  { link_text: "Kestrel 35S", price: "US $90.00", text_2: "Used", text_4: "approx. £70.00", text_5: "1 bid", text_8: "(Sun, 11:00)", text_9: "£6.00 postage", url_2: "/itm/2" }
];

function feedWithRows() {
  const p = automaticFeed({});
  p.read("one", ROWS, SCHEMA);
  return p;
}

it("refuses step 0061 naming where[3], its field, matches and why, and no longer refuses where[2]'s leading (?i)", () => {
  const p = feedWithRows();
  const answer = automationStudioAnswerFirstAmendProcessing(p.feed, { process: STEP_0061, why: WHY });
  expect(answer.resultCode).toBe("result_processing.invalid");
  const said = (answer.evidence as JsonObject).said as string;
  expect(said).toMatch(/^record_output\.process_invalid_condition\. where\[3\] \(field "link_text", matches\): 230 characters, over the 200 a pattern may have\. Write a list of shorter patterns instead/u);
  expect(said).not.toContain("where[2]");
  // Only ids, keys and Core's rules come back, never the pattern.
  expect(said).not.toContain("selbstausl");
});

it("names a pattern JavaScript cannot parse with the parser's own reason", () => {
  const p = feedWithRows();
  const where = [...(STEP_0061.where as JsonObject[]).slice(0, 3), { field: "link_text", matches: "^kestrel(?i) 35" }];
  const answer = automationStudioAnswerFirstAmendProcessing(p.feed, { process: { ...STEP_0061, where }, why: WHY });
  expect((answer.evidence as JsonObject).said).toMatch(/where\[3\] \(field "link_text", matches\): not a valid JavaScript regular expression \(Invalid group\)\. JavaScript reads no inline flag group inside a pattern/u);
});

it("accepts step 0061 with its long pattern written as a list of shorter ones", () => {
  const p = feedWithRows();
  const words = ["35\\s?-?s\\b", "mk\\.?\\s?(ii|2)", "mark 2", "\\b350\\b", "50 deluxe", "lens only", "case only", "box only", "strap", "spares", "not working", "half case"];
  const where = [...(STEP_0061.where as JsonObject[]).slice(0, 3), { field: "link_text", matches: words, not: true }];
  expect(p.feed.amendProcessing({ ...STEP_0061, where }, WHY)).toEqual({ ok: true, changed: true });
});

it("names a reference no field binds to with why, and the fields the rows hold", () => {
  const p = feedWithRows();
  const answer = automationStudioAnswerFirstAmendProcessing(p.feed, { process: { where: [{ field: "title", contains: "Kestrel" }] }, why: WHY });
  expect((answer.evidence as JsonObject).said).toBe(
    'record_output.process_binding_missing_field, record_output.process_unknown_field. "title" is neither a field id nor a field label the rows hold. The rows hold "link_text", "price", "text_2", "text_4", "text_5", "text_8", "text_9", "url_2".'
  );
});
