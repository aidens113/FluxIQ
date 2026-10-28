// Whether a read of one part of a list saw it go on (F8): `listContinues`, two
// closed words the downstream read sends beside its counts. Admitted word by
// word; a word this Core does not know is renamed `"unknown"`, as a stop word
// is, because word sets grow and the two sides ship separately; anything that
// is not two words drops the summary, as every malformed member does.
import { describe, expect, it } from "vitest";
import { extractionSummaryFromOutputs } from "../extraction-summary.ts";

const READ = { recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["title"], missingFields: [], itemsSeen: 5 };
const admit = (extraction: unknown) => extractionSummaryFromOutputs({ result: { extraction } });

describe("a read's word that its list goes on", () => {
  it("is admitted as sent, and nothing a producer put beside the two words travels", () => {
    expect(admit({ ...READ, listContinues: { kind: "load_more", evidence: "load_more_control" } })).toEqual({ ...READ, listContinues: { kind: "load_more", evidence: "load_more_control" } });
    expect(admit({ ...READ, listContinues: { kind: "infinite_scroll", evidence: "still_growing" } })?.listContinues).toEqual({ kind: "infinite_scroll", evidence: "still_growing" });
    // Paused by the site, not ended (t755): a word this Core knows, so not renamed "unknown".
    expect(admit({ ...READ, listContinues: { kind: "infinite_scroll", evidence: "loader_asked_to_wait" } })?.listContinues).toEqual({ kind: "infinite_scroll", evidence: "loader_asked_to_wait" });
    expect(admit({ ...READ, listContinues: { kind: "load_more", evidence: "unopened_replies" } })?.listContinues).toEqual({ kind: "load_more", evidence: "unopened_replies" });
    expect(admit({ ...READ, listContinues: { kind: "next_page", evidence: "next_control", label: "More recipes" } })?.listContinues).toEqual({ kind: "next_page", evidence: "next_control" });
  });

  it("is absent from a read that sent none", () => {
    expect(admit(READ)).toEqual(READ);
  });

  it("renames a word this Core does not know rather than costing the summary", () => {
    expect(admit({ ...READ, listContinues: { kind: "endless_grid", evidence: "virtual_rows" } })?.listContinues).toEqual({ kind: "unknown", evidence: "unknown" });
  });

  it("drops the summary for a fact that is not two words", () => {
    for (const listContinues of [{ kind: "next_page" }, { kind: 3, evidence: "next_control" }, "next_page", null, []]) {
      expect(admit({ ...READ, listContinues }), JSON.stringify(listContinues)).toBeUndefined();
    }
  });
});
