import { describe, expect, it } from "vitest";
import { bindAutomationStudioRecordProcessing, parseAutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "../../index.ts";

// Run `run-mwyg0x66-4d561a42` (t1070), step 0061: the declaration exactly as the model sent it, against the fields its
// read retained (the bindings steps 0059 and 0063 were answered with). It was refused fourteen times in that shape,
// each time answered only `record_output.process_invalid_condition`.
const STEP_0061 = {
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

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: ["link_text", "price", "text_2", "text_4", "text_5", "text_8", "text_9", "url", "url_2"].map((id) => ({ id, label: id, valueType: "string" as const }))
};

describe("a refused processing names each invalid part and why (t1070)", () => {
  it("refuses step 0061 for its one pattern over the length a pattern may have, naming where[3], its field and matches", () => {
    const parsed = parseAutomationStudioRecordProcessing(STEP_0061, SCHEMA);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues).toEqual(["record_output.process_invalid_condition"]);
    // where[2]'s leading (?i) is now read as the case-insensitive flag, so only where[3] is refused.
    expect(parsed.refusals).toEqual([{
      code: "record_output.process_invalid_condition",
      part: "where[3]",
      field: "link_text",
      operator: "matches",
      said: expect.stringMatching(/^where\[3\] \(field "link_text", matches\): 230 characters, over the 200 a pattern may have\. Write a list of shorter patterns instead/u)
    }]);
    // Nothing the model wrote but ids and keys comes back.
    expect(parsed.refusals[0]!.said).not.toContain("selbstausl");
  });

  it("names a pattern JavaScript cannot parse with the parser's reason, and every broken part at once", () => {
    const process = {
      ...STEP_0061,
      where: [
        ...STEP_0061.where.slice(0, 2),
        { field: "link_text", matches: "^new(?i)kestrel" },
        { field: "data-adid", is: "absent" }
      ],
      sort: [{ field: "endt", order: "soonest" }]
    };
    const parsed = parseAutomationStudioRecordProcessing(process, SCHEMA);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.sort()).toEqual(["record_output.process_invalid_condition", "record_output.process_invalid_sort", "record_output.process_unknown_field"]);
    const said = parsed.refusals.map((refusal) => refusal.said);
    expect(said).toContainEqual(expect.stringMatching(/^where\[2\] \(field "link_text", matches\): not a valid JavaScript regular expression \(Invalid group\)\. JavaScript reads no inline flag group inside a pattern/u));
    expect(said).toContainEqual('sort[0] (field "endt", order): must be asc or desc.');
    // A field a valid condition names is checked though another condition in the same list is refused.
    expect(said).toContainEqual(expect.stringMatching(/^where\[3\] \(field "data-adid"\): not a field of the schema; the schema stores "link_text", "price", .*"url_2", and derive makes "gbp", "approx_gbp", "bidn", "endt"\.$/u));
  });

  it("says why a bound, a list, a derive or a comparison is refused, quoting no value", () => {
    const parsed = parseAutomationStudioRecordProcessing({
      derive: [{ id: "price", from: "price" }, { id: "n", from: "text_5", pattern: "(", as: "integer" }],
      where: [{ field: "price", lessThan: "150 pounds" }, { field: "text_2", contains: [] }],
      compare: [{ field: "price", lessThan: 150 }]
    }, SCHEMA);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const said = parsed.refusals.map((refusal) => refusal.said);
    expect(said).toContain('derive[0] (id "price"): makes a column with the id of a stored field; give it a new id.');
    expect(said).toContainEqual(expect.stringMatching(/^derive\[1\] \(field "text_5", pattern\): not a valid JavaScript regular expression \(Unterminated group\)\.$/u));
    expect(said).toContain('derive[1] (field "text_5", as): must be text, number, date.');
    expect(said).toContainEqual(expect.stringMatching(/^where\[0\] \(field "price", lessThan\): written as text, so it is a date bound, and it names no one date\. Write a number bound as a number/u));
    expect(said).toContainEqual(expect.stringMatching(/^where\[1\] \(field "text_2", contains\): an empty list/u));
    expect(said).toContainEqual(expect.stringMatching(/^compare\[0\] \(field "price", lessThan\): must name the other column's field id/u));
    expect(said.join(" ")).not.toContain("150 pounds");
  });

  it("carries the refusals through binding, leaving a reference it could not bind to unresolved alone", () => {
    // "Price" binds to price by its label; "nowhere" binds to nothing.
    const bound = bindAutomationStudioRecordProcessing({ where: [{ field: "Price", matches: "a(?i)b" }, { field: "nowhere", is: "present" }] }, SCHEMA);
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.unresolved).toEqual([{ field: "nowhere", reason: "missing" }]);
    expect(bound.refusals?.map((refusal) => refusal.part)).toEqual(["where[0]"]);
  });

  it("accepts step 0061 once its long pattern is written as a list of shorter ones", () => {
    const words = ["35\\s?-?s\\b", "mk\\.?\\s?(ii|2)", "mark 2", "\\b350\\b", "50 deluxe", "lens only", "case only", "box only", "strap", "spares", "not working", "half case"];
    const process = { ...STEP_0061, where: [...STEP_0061.where.slice(0, 3), { field: "link_text", matches: words, not: true }] };
    expect(parseAutomationStudioRecordProcessing(process, SCHEMA)).toMatchObject({ ok: true });
  });
});
