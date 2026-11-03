// A Core no made of failing computed facts keeps a standing-no record, marked
// Core's, as a judge's no does (framework plan P5b, `../computed-no.ts`): the
// trial gate then keeps Core's record of it. On a library catalogue.
import { describe, expect, it } from "vitest";
import { automationStudioResultStandingNoRecordOf } from "../../standing-no/index.ts";
import { automationStudioResultComputedNo } from "../computed-no.ts";
import { automationStudioResultCountFact } from "../count.ts";
import { BOOKS, bookSet, checklistOf, libraryInput, librarySummary } from "./library-fixture.ts";

const four = [...BOOKS, { title: "Ferns in Winter", author: "Ines Holm", price: "$8.00", format: "Paperback" }];

function failing() {
  const summary = librarySummary({ taskChecklist: checklistOf({ kind: "records", columns: ["title", "author", "price"], rows: { count: 3 } }), recordSets: [bookSet(four)] });
  const [fact] = automationStudioResultCountFact(libraryInput(summary));
  expect(fact).toMatchObject({ kind: "count", status: "fails" });
  return { summary, fact: fact! };
}

describe("the record a computed-fact Core no carries", () => {
  it("is a standing-no record marked Core's, with the defects Core located and no standing call", () => {
    const { summary, fact } = failing();
    const no = automationStudioResultComputedNo(summary, [fact]);
    expect(no.standingNo).toMatchObject({ source: "core", standing: [], located: [{ kind: "kept_not_asked", row: "books", value: "4 rows" }] });
    // Core's words only: the request's words a defect quotes are not part of the record.
    expect(JSON.stringify(no.standingNo)).not.toContain("requestWords");
    // And the record is read back whole from a port, as a gate reads it.
    expect(automationStudioResultStandingNoRecordOf(structuredClone(no.standingNo))).toEqual(no.standingNo);
  });

  it("names the rows the result stored, as a judge's record does", () => {
    const { summary, fact } = failing();
    const record = automationStudioResultComputedNo(summary, [fact]).standingNo!;
    expect(record.stored.length).toBeGreaterThan(0);
  });

  it("is not a record of a judge's no: a record without the mark reads back without it", () => {
    const read = automationStudioResultStandingNoRecordOf({ stored: ["A"], storedWhole: true, conditions: [], standing: [{ call: 1 }] });
    expect(read).not.toHaveProperty("source");
    expect(read).not.toHaveProperty("located");
    expect(automationStudioResultStandingNoRecordOf({ stored: [], storedWhole: true, conditions: [], standing: [], source: "judge" })).toBeUndefined();
    expect(automationStudioResultStandingNoRecordOf({ stored: [], storedWhole: true, conditions: [], standing: [], located: [{ kind: "nonsense", row: "x" }] })).toBeUndefined();
  });
});
