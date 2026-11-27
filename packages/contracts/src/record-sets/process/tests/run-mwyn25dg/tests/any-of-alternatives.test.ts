// Run run-mwyn25dg-3ba0b41c (t1074): every declaration that parsed kept 0 of the 46 rows its read held (0049, 0053,
// 0055: "no qualifying records; 0 rows kept"), and the first (0014) was withheld for a price one `anyOf` group could not
// read. Each wrote `anyOf` as alternatives -- the site's own pound price in one group, its pound estimate of a foreign
// price in another -- and the evaluator read every group as a filter that had to hold: no row has both. Replayed here
// over the recorded rows with each declaration exactly as the run sent it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../../../schema.ts";
import { bindAutomationStudioRecordProcessing, processAutomationStudioRecordRows, type AutomationStudioRecordCollectedRow } from "../../../index.ts";
import { RUN_MWYN25DG_KEYS, RUN_MWYN25DG_PAGES } from "../rows-fixture.ts";

/** The run's own week: the rows state "Mon 21 Sep" with no year. */
const NOW = Date.UTC(2026, 8, 21, 12);
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: RUN_MWYN25DG_KEYS.map((id) => ({ id, label: id, valueType: "string" as const })) };
const ROWS: AutomationStudioRecordCollectedRow[] = RUN_MWYN25DG_PAGES.flatMap((page, at) => page.map((values) => ({ values, nodeId: at === 0 ? "read_p1" : "read_p2b", batchKey: at === 0 ? "read_p1" : "read_p2b", captured: [...RUN_MWYN25DG_KEYS] })));

const PRICE_GROUPS = [
  [{ field: "price", matches: "^£(\\d{1,2}|1[0-4]\\d)\\.\\d\\d$" }],
  [{ field: "text_4", matches: "^approx\\. £(\\d{1,2}|1[0-4]\\d)\\.\\d\\d$" }]
];
const SORT = [{ field: "text_8", order: "asc", as: "date" }];
const COLUMNS = ["link_text", "price", "text_5", "text_9"];

/** 0049's `process`, as sent (`steps/0049-tool-core.set_result_processing/call.json`). */
const D0049 = {
  dedupe: { by: ["data-listingid", "data-adid", "link_text", "price", "text_8"] },
  where: [
    { field: "text_5", matches: "bids?$" },
    { field: "text_2", equals: "For parts or not working", not: true },
    { field: "link_text", matches: "kestrel 35" },
    { field: "link_text", matches: "35 ?-?s\\b|35s|mk ?ii|mark ?2|350|kestrel 50|case only|lens only|lens cap|hood|strap|filter|manual|box only|flashgun|self-timer|selbstausl|spares|non-working|not working|untested|job lot|pair", not: true }
  ],
  anyOf: PRICE_GROUPS, sort: SORT, columns: COLUMNS
};
/** 0053's `process`, as sent: 0049 with the title exclusions split in two and "manual" narrowed to a reprint. */
const D0053 = {
  dedupe: { by: ["link_text", "price", "text_8"] },
  where: [
    { field: "text_5", matches: "bids?$" },
    { field: "text_2", equals: "For parts or not working", not: true },
    { field: "link_text", matches: "kestrel 35" },
    { field: "link_text", matches: "35 ?-?s\\b|35s|mk ?ii|mark ?2|350|kestrel 50|case only|lens only|lens cap|hood|strap|filter", not: true },
    { field: "link_text", matches: "manual (\\(|reprint)|box only|flashgun|self-timer|selbstausl|spares|non-working|untested|job lot|pair|mint, boxed", not: true }
  ],
  anyOf: PRICE_GROUPS, sort: SORT, columns: COLUMNS
};
/** 0014's `process`, as sent: the derived pound estimate in one group, the absent estimate and the derived pound price in the other. */
const D0014 = {
  derive: [
    { id: "gbp_est", from: "text_4", pattern: "£([0-9,]+\\.[0-9]+)", as: "number" },
    { id: "gbp_own", from: "price", pattern: "^£([0-9,]+\\.[0-9]+)", as: "number" },
    { id: "endsort", from: "text_8", pattern: "\\((.*)\\)", as: "text" },
    { id: "mins", from: "text_6", pattern: "(.*)", as: "text" }
  ],
  where: [
    { field: "link_text", matches: "kestrel 35(?![0-9a-z\\-]| s\\b)" },
    { field: "link_text", not: true, matches: "mk ?ii|lens only|case only|lens cap|manual|box only|for spares|not working|nicht|niet" },
    { field: "text_2", not: true, equals: "For parts or not working" },
    { field: "text_5", not: true, equals: "Buy it now" }
  ],
  anyOf: [[{ field: "gbp_est", lessThan: 150 }], [{ field: "text_4", is: "absent" }, { field: "gbp_own", lessThan: 150 }]],
  dedupe: { by: ["url"] },
  columns: ["link_text", "price", "text_5", "text_9", "text_8"]
};

/** The ten auctions the request owes: each original camera auction under £150 (a foreign price by the site's estimate), soonest-ending first. */
const OWED = [
  ["Kestrel 35 Rangefinder Camera", "£64.00"],
  ["KESTREL 35 45mm f/2.8 Voss-Anastigmat — film tested, new seals", "EUR 109,00"],
  ["Kestrel 35 Rangefinder Camera", "£41.00"],
  ["Kestrel 35 rangefinder camera body + original leather case", "£96.00"],
  ["Kestrel 35 — CLA'd 2025, shutter accurate, lovely example", "US $189.00"],
  ["Vintage Kestrel 35 35mm film camera, working, light meter dead", "£27.50"],
  ["Kestrel 35 rangefinder, 45mm f/2.8 lens, film tested", "£78.00"],
  ["Kestrel 35 camera with flash & manual — refurbished by seller", "£122.00"],
  ["Kestrel 35 Kamera Messsucher 45mm 2.8 — sehr gut", "EUR 169,00"],
  ["Kestrel 35 rangefinder — collection only, Sheffield", "£35.00"]
];

function run(process: unknown) {
  const bound = bindAutomationStudioRecordProcessing(process, SCHEMA);
  if (!bound.ok) throw new Error(`refused: ${bound.issues.join(", ")}`);
  return { process: bound.processing, result: processAutomationStudioRecordRows({ mode: "automatic", rows: ROWS, schema: SCHEMA, process: bound.processing, now: NOW }) };
}

describe("run-mwyn25dg-3ba0b41c: anyOf groups are alternatives (t1074)", () => {
  it("holds 46 recorded rows over two pages", () => {
    expect(ROWS).toHaveLength(46);
  });

  it("0053's declaration keeps exactly the ten owed auctions, soonest-ending first", () => {
    const { result } = run(D0053);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.rows.map((row) => [row.link_text, row.price])).toEqual(OWED);
    expect(result.rows[0]).toEqual({ link_text: "Kestrel 35 Rangefinder Camera", price: "£64.00", text_5: "11 bids", text_9: "+£4.95 postage" });
  });

  it("0049's declaration keeps nine auctions: its own `manual` exclusion leaves out the camera sold with a manual, and the account names it there", () => {
    const { result } = run(D0049);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const pairs = [...new Set(result.rows.map((row) => JSON.stringify([row.link_text, row.price])))].map((pair) => JSON.parse(pair) as string[]);
    expect(pairs).toEqual(OWED.filter(([title]) => !title!.includes("manual")));
    // Its own dedupe key holds the listing id and the sponsored-copy id apart, so the listing shown both as a sponsored
    // copy (page 1) and as itself (page 2) is kept twice; 0053's key (title, price, end) keeps it once.
    expect(result.rows.filter((row) => row.link_text === "Kestrel 35 rangefinder camera body + original leather case")).toHaveLength(2);
    expect(result.account.conditions?.[3]?.leftOutOnlyByThis.map((row) => row.label)).toContain("Kestrel 35 camera with flash & manual — refurbished by seller");
    expect(result.account.filters).toHaveLength(1);
    expect(result.account.filters?.[0]).toMatchObject({ kind: "any_of", fields: ["price", "text_4"] });
  });

  it("0014's declaration is decided row by row by the group with evidence, never withheld for a price the other group reads", () => {
    const { result } = run(D0014);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    // The foreign-priced camera under the estimate's bound is kept by the first group; its "EUR" price is no gap.
    expect(result.rows.map((row) => row.price)).toContain("EUR 109,00");
    expect(result.rows.map((row) => row.price)).not.toContain("EUR 175,00");
  });

  it("still withholds a row no group can decide, naming the values of the undecided groups only", () => {
    const process = { derive: [{ id: "gbp", from: "price", pattern: "^£([0-9.]+)$", as: "number" }], anyOf: [[{ field: "gbp", lessThan: 150 }], [{ field: "text_4", is: "present" }, { field: "text_5", contains: "never" }]] };
    const bound = bindAutomationStudioRecordProcessing(process, SCHEMA);
    if (!bound.ok) throw new Error("refused");
    const unreadable = [{ ...ROWS[0]!, values: { ...ROWS[0]!.values, price: "US $50.00", text_4: null } }];
    const result = processAutomationStudioRecordRows({ mode: "automatic", rows: unreadable, schema: SCHEMA, process: bound.processing, now: NOW });
    expect(result.state).toBe("missing-evidence");
    if (result.state !== "missing-evidence") return;
    // The second group is known false (no estimate shown); only the first group's derived price is asked for.
    expect(result.missingEvidence.map((entry) => [entry.operator, entry.index, entry.field, entry.from])).toEqual([["anyOf", 0, "gbp", "price"]]);
  });
});
