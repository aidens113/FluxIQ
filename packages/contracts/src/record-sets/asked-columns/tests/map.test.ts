// Placing a request's columns on the fields a read holds (t1074, `../map.ts`). Run run-mwyn25dg-3ba0b41c asked for
// "title, price, bids and postage" over rows held under the read's own keys; the recorded rows place three by evidence
// and the fourth by the declaration's own order. The other cases use a lending library's loans: nothing here is a
// model-facing word.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import { RUN_MWYN25DG_KEYS, RUN_MWYN25DG_PAGES } from "../../process/tests/run-mwyn25dg/rows-fixture.ts";
import { automationStudioRecordAskedColumns } from "../index.ts";

const KESTREL: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: RUN_MWYN25DG_KEYS.map((id) => ({ id, label: id, valueType: "string" as const })) };
const KESTREL_ROWS = RUN_MWYN25DG_PAGES.flat();
const ASKED = ["title", "price", "bids", "postage"];

describe("automationStudioRecordAskedColumns", () => {
  it("places price by name and bids and postage by their values on run-mwyn25dg's keys, and leaves title unheld without the declaration", () => {
    expect(automationStudioRecordAskedColumns({ asked: ASKED, schema: KESTREL, rows: KESTREL_ROWS })).toEqual({
      held: [{ asked: "price", field: "price", by: "name" }, { asked: "bids", field: "text_5", by: "values" }, { asked: "postage", field: "text_9", by: "values" }],
      unheld: ["title"]
    });
  });

  it("places title by the declaration's own order where the evidence agrees with every other place (0049's columns)", () => {
    expect(automationStudioRecordAskedColumns({ asked: ASKED, schema: KESTREL, rows: KESTREL_ROWS, columns: ["link_text", "price", "text_5", "text_9"] })).toEqual({
      held: [{ asked: "title", field: "link_text", by: "order" }, { asked: "price", field: "price", by: "name" }, { asked: "bids", field: "text_5", by: "values" }, { asked: "postage", field: "text_9", by: "values" }],
      unheld: []
    });
  });

  it("takes nothing by order where the declaration disagrees with the evidence", () => {
    const placed = automationStudioRecordAskedColumns({ asked: ASKED, schema: KESTREL, rows: KESTREL_ROWS, columns: ["link_text", "price", "text_9", "text_5"] });
    expect(placed.unheld).toEqual(["title"]);
  });

  const LOANS: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["link_text", "text_2", "text_3", "Due Date", "secret"].map((id) => ({ id, label: id, valueType: "string" as const, ...(id === "secret" ? { handling: "exclude" as const } : {}) })) };
  const LOAN_ROWS = [
    { link_text: "Atlas of rivers", text_2: "2 renewals left", text_3: "Fine $0.50", "Due Date": "3 Jan", secret: "renewal renewals renewal" },
    { link_text: "Birds", text_2: "1 renewal left", text_3: "No fine", "Due Date": "5 Jan", secret: "renewal" },
    { link_text: "Clouds", text_2: null, text_3: "Fine $2.00", "Due Date": "9 Jan", secret: "renewal" }
  ];

  it("reads names with case, spaces, separators and plurals aside, and never places an excluded field", () => {
    expect(automationStudioRecordAskedColumns({ asked: ["due date", "renewals", "fines"], schema: LOANS, rows: LOAN_ROWS })).toEqual({
      held: [{ asked: "due date", field: "Due Date", by: "name" }, { asked: "renewals", field: "text_2", by: "values" }, { asked: "fines", field: "text_3", by: "values" }],
      unheld: []
    });
  });

  it("places nothing on a tie between fields with different values, and takes fields with the same values as one", () => {
    const tied = LOAN_ROWS.map((row) => ({ ...row, text_3: row.text_2 === null ? null : `${row.text_2} soon` }));
    expect(automationStudioRecordAskedColumns({ asked: ["renewals"], schema: LOANS, rows: tied }).unheld).toEqual(["renewals"]);
    const same = LOAN_ROWS.map((row) => ({ ...row, text_3: row.text_2 }));
    // Fields holding the same values on every row are one column: the first in schema order is placed.
    expect(automationStudioRecordAskedColumns({ asked: ["renewals"], schema: LOANS, rows: same })).toEqual({ held: [{ asked: "renewals", field: "text_2", by: "values" }], unheld: [] });
  });
});
