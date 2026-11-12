import { describe, expect, it } from "vitest";
import { automationStudioResultEvidenceScreen } from "../index.ts";
import type { AutomationStudioResultEvidenceBundle } from "../types.ts";

function bundle(): AutomationStudioResultEvidenceBundle {
  const rows = Array.from({ length: 80 }, (_, index) => ({ title: `Record ${index}`, detail: index === 79 ? "Source words ".repeat(200) : "Whole" }));
  return {
    pages: [{ source: "read.one", step: "reader", position: 2, version: 3, conditions: [{ field: "available", is: "present" }], fields: { title: "title_field" }, listKey: "list.one", place: "page=1", kept: rows.length, rows, carried: true, leftOut: { sets: [{ kind: "alone", conditions: [0], rows: [{ title: "Left out", detail: "Reason words ".repeat(200) }] }] } }],
    coverage: [{ step: "reader", version: 3, places: ["page=1"], first: "read", last: { place: "page=1", paging: { verdict: "ended", reason: "No following page" } } }],
    answerContract: { columns: ["title"] }, working: [{ step: "working", kept: 5 }], looks: []
  };
}

describe("the shared judge evidence screen", () => {
  it("keeps every safe source row, long value and provenance field whole", () => {
    const original = bundle();
    expect(automationStudioResultEvidenceScreen(original, [])).toEqual({ value: original, withheld: false });
    expect(original.pages[0]?.rows).toHaveLength(80);
  });

  it("withholds denied keys and credential-shaped cells without losing safe siblings or page identity", () => {
    const original = bundle();
    const secret = "sk-abcdefghij0123456789abcd";
    const page = original.pages[0]!;
    const screened = automationStudioResultEvidenceScreen({ ...original, pages: [{ ...page, rows: [{ title: "Safe record", headers: "forbidden source value", detail: secret }], kept: 1 }] }, ["headers"]);
    expect(screened.withheld).toBe(true);
    expect(screened.value.pages).toMatchObject([{ source: "read.one", step: "reader", version: 3, place: "page=1", rows: [{ title: "Safe record", detail: "(withheld)" }] }]);
    expect(JSON.stringify(screened)).not.toContain(secret);
    expect(JSON.stringify(screened)).not.toContain("forbidden source value");
    expect(screened.value.coverage).toEqual(original.coverage);
  });
});
